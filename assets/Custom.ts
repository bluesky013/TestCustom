import { _decorator, rendering, renderer, game, Game, gfx, resources, Material, instantiate } from 'cc';
import { JSB } from 'cc/env';
import { AntiAliasing,
    buildForwardPass, buildBloomPasses, buildFxaaPass, buildPostprocessPass, buildUIPass,
    isUICamera, decideProfilerCamera, getRenderArea, getLoadOpOfClearFlag, getClearFlags } from './PassUtils';

let csMat: Material = null;

resources.load("compute_mat", Material, (err, material) => {
    csMat = material;
});

export function buildNativeComputePass (camera: renderer.scene.Camera, ppl: rendering.Pipeline) {
    const area = getRenderArea(camera, camera.window.width, camera.window.height);
    if (!ppl.containsResource("shadingRate")) {
        ppl.addShadingRateTexture("shadingRate", 256, 256, rendering.ResourceResidency.MANAGED);
        ppl.addStorageBuffer("shadingBuffer", gfx.Format.UNKNOWN, 256 * 16, rendering.ResourceResidency.MANAGED);
    }

    const tc = ppl.addComputePass("test-compute");
    const computeView1 = new rendering.ComputeView("shading_buffer", rendering.AccessType.WRITE);
    const computeView2 = new rendering.ComputeView("shading_rate", rendering.AccessType.WRITE);


    tc.addComputeView("shadingBuffer", computeView1);
    tc.addComputeView("shadingRate", computeView2);

    tc.addQueue().addDispatch(8, 8, 1, csMat, 0);
}

export function buildNativeForwardPass (camera, ppl: rendering.Pipeline) {
    const area = getRenderArea(camera, camera.window.width, camera.window.height);
    const width = area.width;
    const height = area.height;

    // Resources
    const forwardPassRTName = `forwardColor`;
    const forwardPassDSName = `forwardDS`;
    if (!ppl.containsResource(forwardPassRTName)) {
        ppl.addRenderTexture(forwardPassRTName, gfx.Format.BGRA8, width, height, camera.window);
        ppl.addDepthStencil(forwardPassDSName, gfx.Format.DEPTH_STENCIL, width, height, rendering.ResourceResidency.MANAGED);
    } else {
        ppl.updateRenderWindow(forwardPassRTName, camera.window);
        ppl.updateDepthStencil(forwardPassDSName, width, height);
    }

    // Passes
    const forwardPass = ppl.addRasterPass(width, height, 'default');
    forwardPass.name = `forwardPass`;
    forwardPass.setViewport(new gfx.Viewport(area.x, area.y, width, height));

    const cameraRenderTargetLoadOp = getLoadOpOfClearFlag(camera.clearFlag, rendering.AttachmentType.RENDER_TARGET);
    const cameraDepthStencilLoadOp = getLoadOpOfClearFlag(camera.clearFlag, rendering.AttachmentType.DEPTH_STENCIL);

    forwardPass.addRasterView(forwardPassRTName,
        new rendering.RasterView('_',
            rendering.AccessType.WRITE, rendering.AttachmentType.RENDER_TARGET,
            cameraRenderTargetLoadOp,
            gfx.StoreOp.STORE,
            getClearFlags(rendering.AttachmentType.RENDER_TARGET, camera.clearFlag, cameraRenderTargetLoadOp),
            new gfx.Color(camera.clearColor.x, camera.clearColor.y, camera.clearColor.z, camera.clearColor.w)));
    forwardPass.addRasterView(forwardPassDSName,
        new rendering.RasterView('_',
            rendering.AccessType.WRITE, rendering.AttachmentType.DEPTH_STENCIL,
            cameraDepthStencilLoadOp,
            gfx.StoreOp.STORE,
            getClearFlags(rendering.AttachmentType.DEPTH_STENCIL, camera.clearFlag, cameraDepthStencilLoadOp),
            new gfx.Color(camera.clearDepth, camera.clearStencil, 0, 0)));
    forwardPass.addRasterView('shadingRate',
        new rendering.RasterView('_',
            rendering.AccessType.READ, rendering.AttachmentType.SHADING_RATE,
            gfx.LoadOp.LOAD, gfx.StoreOp.DISCARD,
            gfx.ClearFlagBit.NONE,
            new gfx.Color(0, 0, 0, 0)));

    forwardPass
        .addQueue(rendering.QueueHint.RENDER_OPAQUE)
        .addSceneOfCamera(camera, new rendering.LightInfo(),
            rendering.SceneFlags.OPAQUE_OBJECT
            | rendering.SceneFlags.PLANAR_SHADOW
            | rendering.SceneFlags.CUTOUT_OBJECT
            | rendering.SceneFlags.DEFAULT_LIGHTING
            | rendering.SceneFlags.DRAW_INSTANCING);
    forwardPass
        .addQueue(rendering.QueueHint.RENDER_TRANSPARENT)
        .addSceneOfCamera(camera, new rendering.LightInfo(),
            rendering.SceneFlags.TRANSPARENT_OBJECT
            | rendering.SceneFlags.GEOMETRY);
    forwardPass
        .addQueue(rendering.QueueHint.RENDER_TRANSPARENT)
        .addSceneOfCamera(camera, new rendering.LightInfo(),
            rendering.SceneFlags.UI);
    forwardPass.showStatistics = true;
}

export function buildWebPipeline (cameras: renderer.scene.Camera[], pipeline: rendering.Pipeline) {
    decideProfilerCamera(cameras);
    const camera = cameras[0];
    const isGameView = camera.cameraUsage === renderer.scene.CameraUsage.GAME
        || camera.cameraUsage === renderer.scene.CameraUsage.GAME_VIEW;
    if (!isGameView) {
        // forward pass
        buildForwardPass(camera, pipeline, isGameView);
        return;
    }
    // TODO: The actual project is not so simple to determine whether the ui camera, here is just as a demo demonstration.
    if (!isUICamera(camera)) {
        // forward pass
        const forwardInfo = buildForwardPass(camera, pipeline, isGameView);
        // fxaa pass
        const fxaaInfo = buildFxaaPass(camera, pipeline, forwardInfo.rtName);
        // bloom passes
        const bloomInfo = buildBloomPasses(camera, pipeline, fxaaInfo.rtName);
        // Present Pass
        buildPostprocessPass(camera, pipeline, bloomInfo.rtName, AntiAliasing.NONE);
        return;
    }
    // render ui
    buildUIPass(camera, pipeline);
}

export class TestCustomPipeline implements rendering.PipelineBuilder {
    setup(cameras: renderer.scene.Camera[], pipeline: rendering.Pipeline): void {
        if (!JSB) {
            buildWebPipeline(cameras, pipeline);
        } else if (csMat != null) {
            // compute pass
            buildNativeComputePass(cameras[0], pipeline);

            // forwrad pass
            buildNativeForwardPass(cameras[0], pipeline);
        }
    }
}

game.on(Game.EVENT_RENDERER_INITED, () => {
    rendering.setCustomPipeline('Custom', new TestCustomPipeline);
});