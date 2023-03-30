import { _decorator, Component, Material } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('Materials')
export class Materials extends Component {

    @property({ type: Material })
    public material = null;

    start() {

    }

    update(deltaTime: number) {
        
    }
}

