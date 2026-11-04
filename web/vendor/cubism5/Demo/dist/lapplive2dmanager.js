import { CubismMatrix44 } from '../../Framework/dist/math/cubismmatrix44.js';
import { ACubismMotion } from '../../Framework/dist/motion/acubismmotion.js';
import { CubismWebGLOffscreenManager } from '../../Framework/dist/rendering/cubismoffscreenmanager.js';
import * as LAppDefine from './lappdefine.js';
import { LAppModel } from './lappmodel.js';
import { LAppPal } from './lapppal.js';
import { LAppSubdelegate } from './lappsubdelegate.js';
export class LAppLive2DManager {
    releaseAllModel() {
        this._models.length = 0;
    }
    setOffscreenSize(width, height) {
        for(let i = 0; i < this._models.length; i++){
            const model = this._models[i];
            model?.setRenderTargetSize(width, height);
        }
    }
    onDrag(x, y) {
        const model = this._models[0];
        if (model) {
            model.setDragging(x, y);
        }
    }
    onTap(x, y) {
        if (LAppDefine.DebugLogEnable) {
            LAppPal.printMessage(`[APP]tap point: {x: ${x.toFixed(2)} y: ${y.toFixed(2)}}`);
        }
        const model = this._models[0];
        if (model.hitTest(LAppDefine.HitAreaNameHead, x, y)) {
            if (LAppDefine.DebugLogEnable) {
                LAppPal.printMessage(`[APP]hit area: [${LAppDefine.HitAreaNameHead}]`);
            }
            model.setRandomExpression();
        } else if (model.hitTest(LAppDefine.HitAreaNameBody, x, y)) {
            if (LAppDefine.DebugLogEnable) {
                LAppPal.printMessage(`[APP]hit area: [${LAppDefine.HitAreaNameBody}]`);
            }
            model.startRandomMotion(LAppDefine.MotionGroupTapBody, LAppDefine.PriorityNormal, this.finishedMotion, this.beganMotion);
        }
    }
    onUpdate() {
        const gl = this._subdelegate.getGl();
        CubismWebGLOffscreenManager.getInstance().beginFrameProcess(gl);
        const { width, height } = this._subdelegate.getCanvas();
        const projection = new CubismMatrix44();
        const model = this._models[0];
        if (model.getModel()) {
            if (model.getModel().getCanvasWidth() > 1.0 && width < height) {
                model.getModelMatrix().setWidth(2.0);
                projection.scale(1.0, width / height);
            } else {
                projection.scale(height / width, 1.0);
            }
            if (this._viewMatrix != null) {
                projection.multiplyByMatrix(this._viewMatrix);
            }
        }
        model.update();
        model.draw(projection);
        CubismWebGLOffscreenManager.getInstance().endFrameProcess(gl);
        CubismWebGLOffscreenManager.getInstance().releaseStaleRenderTextures(gl);
    }
    nextScene() {
        const no = (this._sceneIndex + 1) % LAppDefine.ModelDirSize;
        this.changeScene(no);
    }
    changeScene(index) {
        this._sceneIndex = index;
        if (LAppDefine.DebugLogEnable) {
            LAppPal.printMessage(`[APP]model index: ${this._sceneIndex}`);
        }
        const model = LAppDefine.ModelDir[index];
        const modelPath = LAppDefine.ResourcesPath + model + '/';
        let modelJsonName = LAppDefine.ModelDir[index];
        modelJsonName += '.model3.json';
        this.releaseAllModel();
        const instance = new LAppModel();
        instance.setSubdelegate(this._subdelegate);
        instance.loadAssets(modelPath, modelJsonName);
        this._models.push(instance);
    }
    setViewMatrix(m) {
        for(let i = 0; i < 16; i++){
            this._viewMatrix.getArray()[i] = m.getArray()[i];
        }
    }
    addModel(sceneIndex = 0) {
        this._sceneIndex = sceneIndex;
        this.changeScene(this._sceneIndex);
    }
    constructor(){
        this._subdelegate = null;
        this._viewMatrix = new CubismMatrix44();
        this._models = new Array();
        this._sceneIndex = 0;
    }
    release() {}
    initialize(subdelegate) {
        this._subdelegate = subdelegate;
        this.changeScene(this._sceneIndex);
    }
    _subdelegate;
    _viewMatrix;
    _models;
    _sceneIndex;
    beganMotion = (self)=>{
        LAppPal.printMessage('Motion Began:');
        console.log(self);
    };
    finishedMotion = (self)=>{
        LAppPal.printMessage('Motion Finished:');
        console.log(self);
    };
}
