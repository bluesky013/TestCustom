import { _decorator, rendering, renderer, game, Game, gfx, resources, Material, instantiate, Vec4 } from 'cc';
import { JSB } from 'cc/env';
import { AntiAliasing,
    buildForwardPass, buildBloomPasses, buildFxaaPass, buildPostprocessPass, buildUIPass,
    buildNativeForwardPass,
    isUICamera, decideProfilerCamera, getRenderArea, getLoadOpOfClearFlag, getClearFlags } from './PassUtils';

let csMat: Material = null;

let sub0Mat: Material = null;
let sub1Mat: Material = null;
let sub2Mat: Material = null;

resources.load("compute_mat", Material, (err, material) => {
    csMat = material;
});

resources.load('custom-sub0', Material, (error, material) => {
    sub0Mat = material;
});

resources.load('custom-sub1', Material, (error, material) => {
    sub1Mat = material;
});

resources.load('custom-sub2', Material, (error, material) => {
    sub2Mat = material;
});

function addOrUpdateRenderTarget(name: string, format: gfx.Format, width: number, height: number, residency: rendering.ResourceResidency, pipeline: rendering.Pipeline) {
    if (!pipeline.containsResource(name)) {
        pipeline.addRenderTarget(name, format, width, height, residency);
    } else {
        pipeline.updateRenderTarget(name, width, height);
    }
}

export function buildProgrammableBlendPass(camera: renderer.scene.Camera, pipeline: rendering.Pipeline) {
    const area = getRenderArea(camera, camera.window.width, camera.window.height);
    const width = area.width;
    const height = area.height;

    addOrUpdateRenderTarget("c0", gfx.Format.RGBA8, width, height, rendering.ResourceResidency.MEMORYLESS, pipeline);
    addOrUpdateRenderTarget("c1", gfx.Format.RGBA8, width, height, rendering.ResourceResidency.MEMORYLESS, pipeline);
    addOrUpdateRenderTarget("c2", gfx.Format.RGBA8, width, height, rendering.ResourceResidency.MEMORYLESS, pipeline);
    addOrUpdateRenderTarget("c3", gfx.Format.RGBA8, width, height, rendering.ResourceResidency.MEMORYLESS, pipeline);
    addOrUpdateRenderTarget("c4", gfx.Format.RGBA8, width, height, rendering.ResourceResidency.MANAGED, pipeline);
    // addOrUpdateRenderTarget("ds", gfx.Format.DEPTH, width, height, rendering.ResourceResidency.MEMORYLESS, pipeline);

    const clearColor = new gfx.Color(0, 0, 0, 0);
    const builder = pipeline.addRenderPass(width, height, 'default');
    const subpass0 = builder.addRenderSubpass('custom-sub0');
    subpass0.addRenderTarget("c0", rendering.AccessType.WRITE, "_", gfx.LoadOp.CLEAR, gfx.StoreOp.DISCARD, clearColor);
    subpass0.addRenderTarget("c1", rendering.AccessType.WRITE, "_", gfx.LoadOp.CLEAR, gfx.StoreOp.DISCARD, clearColor);
    subpass0.addRenderTarget("c2", rendering.AccessType.WRITE, "_", gfx.LoadOp.CLEAR, gfx.StoreOp.DISCARD, clearColor);
    subpass0.addRenderTarget("c3", rendering.AccessType.WRITE, "_", gfx.LoadOp.CLEAR, gfx.StoreOp.DISCARD, clearColor);
    // subpass0.addDepthStencil("ds", rendering.AccessType.WRITE, "_", gfx.LoadOp.CLEAR, gfx.StoreOp.DISCARD);

    subpass0
        .addQueue(rendering.QueueHint.RENDER_OPAQUE)
        .addFullscreenQuad(sub0Mat, 0);

    const subpass1 = builder.addRenderSubpass('custom-sub1');
    subpass1.addRenderTarget("c0", rendering.AccessType.READ, "c0", gfx.LoadOp.DISCARD, gfx.StoreOp.DISCARD, clearColor);
    subpass1.addRenderTarget("c1", rendering.AccessType.READ, "c1", gfx.LoadOp.DISCARD, gfx.StoreOp.DISCARD, clearColor);
    subpass1.addRenderTarget("c4", rendering.AccessType.WRITE, "color", gfx.LoadOp.CLEAR, gfx.StoreOp.STORE, clearColor);
    
    // subpass1.addDepthStencil("ds", rendering.AccessType.READ, "inds", gfx.LoadOp.DISCARD, gfx.StoreOp.DISCARD);

    subpass1
        .addQueue(rendering.QueueHint.RENDER_OPAQUE)
        .addFullscreenQuad(sub1Mat, 0);

    const subpass2 = builder.addRenderSubpass('custom-sub2');
    subpass2.addRenderTarget("c3", rendering.AccessType.READ, "c1", gfx.LoadOp.DISCARD, gfx.StoreOp.DISCARD, clearColor);
    subpass2.addRenderTarget("c2", rendering.AccessType.READ, "c0", gfx.LoadOp.DISCARD, gfx.StoreOp.DISCARD, clearColor);
    subpass2.addRenderTarget("c4", rendering.AccessType.WRITE, "color", gfx.LoadOp.DISCARD, gfx.StoreOp.STORE, clearColor);
    // subpass2.addDepthStencil("ds", rendering.AccessType.READ, "inds", gfx.LoadOp.DISCARD, gfx.StoreOp.DISCARD);

    subpass2
        .addQueue(rendering.QueueHint.RENDER_OPAQUE)
        .addFullscreenQuad(sub2Mat, 0);
}

export function buildNativeCopyPass(camera: renderer.scene.Camera, ppl: rendering.Pipeline) {
    const area = getRenderArea(camera, camera.window.width, camera.window.height);
    const width = area.width;
    const height = area.height;

    if (!ppl.containsResource('forwardColor_copy')) {
        ppl.addRenderTarget('forwardColor_copy', gfx.Format.RGBA8, width, height, rendering.ResourceResidency.MANAGED);
    }

    const cc = ppl.addCopyPass([new rendering.CopyPair('forwardColor', 'forwardColor_copy', 1, 1, 0, 0, 0, 0, 0, 0)]);
}

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

    let buffer = new ArrayBuffer(4 * 16);
    let view = new Float32Array(buffer);
    view[0] = 1.0;
    view[1] = 2.0;
    view[2] = 3.0;
    view[3] = 4.0;
    
    view[4] = 5.0;
    view[5] = 6.0;
    view[6] = 7.0;
    view[7] = 8.0;

    view[8] = 9.0;
    view[9] = 10.0;
    view[10] = 11.0;
    view[11] = 12.0;

    view[12] = 13.0;
    view[13] = 14.0;
    view[14] = 15.0;
    view[15] = 16.0;

    tc.setVec4("factor1", new Vec4(1, 1, 1, 1));
    tc.setArrayBuffer("factor2", buffer);
}

export function buildNativeForwardPass2 (camera, ppl: rendering.Pipeline) {
    const area = getRenderArea(camera, camera.window.width, camera.window.height);
    const width = area.width;
    const height = area.height;

    // Resources
    const forwardPassRTName = `forwardColor`;
    const forwardPassDSName = `forwardDS`;
    if (!ppl.containsResource(forwardPassRTName)) {
        ppl.addRenderWindow(forwardPassRTName, gfx.Format.BGRA8, width, height, camera.window);
        ppl.addDepthStencil(forwardPassDSName, gfx.Format.DEPTH_STENCIL, width, height, rendering.ResourceResidency.MANAGED);
    } else {
        ppl.updateRenderWindow(forwardPassRTName, camera.window);
        ppl.updateDepthStencil(forwardPassDSName, width, height);
    }

    // Passes
    const forwardPass = ppl.addRenderPass(width, height, 'default');
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
    // forwardPass.addRasterView('shadingRate',
    //     new rendering.RasterView('_',
    //         rendering.AccessType.READ, rendering.AttachmentType.SHADING_RATE,
    //         gfx.LoadOp.LOAD, gfx.StoreOp.DISCARD,
    //         gfx.ClearFlagBit.NONE,
    //         new gfx.Color(0, 0, 0, 0)));

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

export function buildCustomPass(target, camera, ppl: rendering.Pipeline) {
    const area = getRenderArea(camera, camera.window.width, camera.window.height);
    const width = area.width;
    const height = area.height;

    const forwardPass = ppl.addRenderPass(width, height, 'default');
    forwardPass.addRenderTarget(target, gfx.LoadOp.LOAD, gfx.StoreOp.STORE);
    forwardPass.setViewport(new gfx.Viewport(area.x, area.y, width, height));
    forwardPass.addQueue(rendering.QueueHint.RENDER_OPAQUE).setCustomBehavior("CustomSDK_Queue0");
    forwardPass.setCustomBehavior("CustomSDK_Pass0");
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

function buildNativeVRSComputePass(camera:renderer.scene.Camera, ppl: rendering.Pipeline) {
    function setPassInput(inputName: string, shaderName:string) {
        if (ppl.containsResource(inputName)) {
            const computeView = new rendering.ComputeView();
            computeView.name = shaderName;
            computeView.accessType = rendering.AccessType.READ;
            tc.addComputeView(inputName, computeView);
        }
    }

    const area = getRenderArea(camera, camera.window.width, camera.window.height);
    const width = area.width;
    const height = area.height;
    const tileSize = 16;
    const shadingRateImageWidth = (width + tileSize - 1) / tileSize;
    const shadingRateImageHeight = (height + tileSize - 1) / tileSize;

    let finalImage = "forwardColor";
    let depthImage = "forwardDS";

    if (!ppl.containsResource("shadingRate")) {
        ppl.addShadingRateTexture("shadingRate", shadingRateImageWidth, shadingRateImageHeight, rendering.ResourceResidency.MANAGED);
    }

    const tc = ppl.addComputePass("adaptive-vrs");
    tc.setCustomBehavior("CustomSDK_Compute0");

    setPassInput(finalImage, "final_image");
    setPassInput(depthImage, "depth_image");

    tc.setMat4("view", camera.matView);
    tc.setMat4("project", camera.matProj);

    const shadingRateView = new rendering.ComputeView("shading_rate", rendering.AccessType.WRITE);

    tc.addComputeView("shadingRate", shadingRateView);
    tc.addQueue();
}

export function buildPresentPass (camera, ppl) {

    const area = getRenderArea(camera, camera.window.width, camera.window.height);
    const width = area.width;
    const height = area.height;
    const presentImage = 'swapchain_out';

    if (!ppl.containsResource(presentImage)) {
        ppl.addRenderTexture(presentImage, gfx.Format.BGRA8, width, height, camera.window);
    } else {
        ppl.updateRenderWindow(presentImage, camera.window);
    }

    const cc = ppl.addCopyPass();
    cc.addPair(new rendering.CopyPair('forwardColor', presentImage, 1, 1, 0, 0, 0, 0, 0, 0));

}

export class TestCustomPipeline implements rendering.PipelineBuilder {
    setup(cameras: renderer.scene.Camera[], pipeline: rendering.Pipeline): void {
        if (!JSB) {
            buildWebPipeline(cameras, pipeline);
        } else if (csMat != null) {
            // compute pass
            // buildNativeComputePass(cameras[0], pipeline);

            // build subpass
            buildProgrammableBlendPass(cameras[0], pipeline);

            // forwrad pass
            buildNativeForwardPass2(cameras[0], pipeline);

            //buildCustomPass(`forwardColor`, cameras[0], pipeline);
            // buildNativeVRSComputePass(cameras[0], pipeline);

            // buildPresentPass(cameras[0], pipeline);

            // copy backbuffer
            // buildNativeCopyPass(cameras[0], pipeline);
        }
    }
}

game.on(Game.EVENT_RENDERER_INITED, () => {
    rendering.setCustomPipeline('CustomTest', new TestCustomPipeline);
});