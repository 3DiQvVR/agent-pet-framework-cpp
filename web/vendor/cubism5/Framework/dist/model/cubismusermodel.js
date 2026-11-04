import { CubismBreath } from '../effect/cubismbreath.js';
import { CubismEyeBlink } from '../effect/cubismeyeblink.js';
import { CubismPose } from '../effect/cubismpose.js';
import { ICubismModelSetting } from '../icubismmodelsetting.js';
import { CubismIdHandle } from '../id/cubismid.js';
import { Constant } from '../live2dcubismframework.js';
import { CubismModelMatrix } from '../math/cubismmodelmatrix.js';
import { CubismTargetPoint } from '../math/cubismtargetpoint.js';
import { ACubismMotion, BeganMotionCallback, FinishedMotionCallback } from '../motion/acubismmotion.js';
import { CubismExpressionMotion } from '../motion/cubismexpressionmotion.js';
import { CubismExpressionMotionManager } from '../motion/cubismexpressionmotionmanager.js';
import { CubismMotion } from '../motion/cubismmotion.js';
import { CubismMotionManager } from '../motion/cubismmotionmanager.js';
import { CubismMotionQueueManager } from '../motion/cubismmotionqueuemanager.js';
import { CubismPhysics } from '../physics/cubismphysics.js';
import { CubismRenderer_WebGL } from '../rendering/cubismrenderer_webgl.js';
import { CubismLogError, CubismLogInfo } from '../utils/cubismdebug.js';
import { CubismMoc } from './cubismmoc.js';
import { CubismModel } from './cubismmodel.js';
import { CubismModelUserData } from './cubismmodeluserdata.js';
export class CubismUserModel {
    isInitialized() {
        return this._initialized;
    }
    setInitialized(v) {
        this._initialized = v;
    }
    isUpdating() {
        return this._updating;
    }
    setUpdating(v) {
        this._updating = v;
    }
    setDragging(x, y) {
        this._dragManager.set(x, y);
    }
    getModelMatrix() {
        return this._modelMatrix;
    }
    setRenderTargetSize(width, height) {
        if (this._renderer) {
            this._renderer.setRenderTargetSize(width, height);
        }
    }
    setOpacity(a) {
        this._opacity = a;
    }
    getOpacity() {
        return this._opacity;
    }
    loadModel(buffer, shouldCheckMocConsistency = false) {
        this._moc = CubismMoc.create(buffer, shouldCheckMocConsistency);
        if (this._moc == null) {
            CubismLogError('Failed to CubismMoc.create().');
            return;
        }
        this._model = this._moc.createModel();
        if (this._model == null) {
            CubismLogError('Failed to CreateModel().');
            return;
        }
        this._model.saveParameters();
        this._modelMatrix = new CubismModelMatrix(this._model.getCanvasWidth(), this._model.getCanvasHeight());
    }
    loadMotion(buffer, size, name, onFinishedMotionHandler, onBeganMotionHandler, modelSetting, group, index, shouldCheckMotionConsistency = false) {
        if (buffer == null || size == 0) {
            CubismLogError('Failed to loadMotion().');
            return null;
        }
        const motion = CubismMotion.create(buffer, size, onFinishedMotionHandler, onBeganMotionHandler, shouldCheckMotionConsistency);
        if (motion == null) {
            CubismLogError(`Failed to create motion from buffer in LoadMotion()`);
            return null;
        }
        if (modelSetting) {
            const fadeInTime = modelSetting.getMotionFadeInTimeValue(group, index);
            if (fadeInTime >= 0.0) {
                motion.setFadeInTime(fadeInTime);
            }
            const fadeOutTime = modelSetting.getMotionFadeOutTimeValue(group, index);
            if (fadeOutTime >= 0.0) {
                motion.setFadeOutTime(fadeOutTime);
            }
        }
        return motion;
    }
    loadExpression(buffer, size, name) {
        if (buffer == null || size == 0) {
            CubismLogError('Failed to loadExpression().');
            return null;
        }
        return CubismExpressionMotion.create(buffer, size);
    }
    loadPose(buffer, size) {
        if (buffer == null || size == 0) {
            CubismLogError('Failed to loadPose().');
            return;
        }
        this._pose = CubismPose.create(buffer, size);
    }
    loadUserData(buffer, size) {
        if (buffer == null || size == 0) {
            CubismLogError('Failed to loadUserData().');
            return;
        }
        this._modelUserData = CubismModelUserData.create(buffer, size);
    }
    loadPhysics(buffer, size) {
        if (buffer == null || size == 0) {
            CubismLogError('Failed to loadPhysics().');
            return;
        }
        this._physics = CubismPhysics.create(buffer, size);
    }
    isHit(drawableId, pointX, pointY) {
        const drawIndex = this._model.getDrawableIndex(drawableId);
        if (drawIndex < 0) {
            return false;
        }
        const count = this._model.getDrawableVertexCount(drawIndex);
        const vertices = this._model.getDrawableVertices(drawIndex);
        let left = vertices[0];
        let right = vertices[0];
        let top = vertices[1];
        let bottom = vertices[1];
        for(let j = 1; j < count; ++j){
            const x = vertices[Constant.vertexOffset + j * Constant.vertexStep];
            const y = vertices[Constant.vertexOffset + j * Constant.vertexStep + 1];
            if (x < left) {
                left = x;
            }
            if (x > right) {
                right = x;
            }
            if (y < top) {
                top = y;
            }
            if (y > bottom) {
                bottom = y;
            }
        }
        const tx = this._modelMatrix.invertTransformX(pointX);
        const ty = this._modelMatrix.invertTransformY(pointY);
        return left <= tx && tx <= right && top <= ty && ty <= bottom;
    }
    getModel() {
        return this._model;
    }
    getMocVersionFromBuffer(mocBytes) {
        return CubismMoc.getMocVersionFromBuffer(mocBytes);
    }
    getRenderer() {
        return this._renderer;
    }
    createRenderer(width, height, maskBufferCount = 1) {
        if (this._renderer) {
            this.deleteRenderer();
        }
        this._renderer = new CubismRenderer_WebGL(width, height);
        this._renderer.initialize(this._model, maskBufferCount);
    }
    deleteRenderer() {
        if (this._renderer != null) {
            this._renderer.release();
            this._renderer = null;
        }
    }
    motionEventFired(eventValue) {
        CubismLogInfo('{0}', eventValue);
    }
    static cubismDefaultMotionEventCallback(caller, eventValue, customData) {
        const model = customData;
        if (model != null) {
            model.motionEventFired(eventValue);
        }
    }
    constructor(){
        this._moc = null;
        this._model = null;
        this._motionManager = null;
        this._expressionManager = null;
        this._eyeBlink = null;
        this._breath = null;
        this._modelMatrix = null;
        this._pose = null;
        this._dragManager = null;
        this._physics = null;
        this._modelUserData = null;
        this._initialized = false;
        this._updating = false;
        this._opacity = 1.0;
        this._mocConsistency = false;
        this._debugMode = false;
        this._renderer = null;
        this._motionManager = new CubismMotionManager();
        this._motionManager.setEventCallback(CubismUserModel.cubismDefaultMotionEventCallback, this);
        this._expressionManager = new CubismExpressionMotionManager();
        this._dragManager = new CubismTargetPoint();
    }
    release() {
        if (this._motionManager != null) {
            this._motionManager.release();
            this._motionManager = null;
        }
        if (this._expressionManager != null) {
            this._expressionManager.release();
            this._expressionManager = null;
        }
        if (this._moc != null) {
            this._moc.deleteModel(this._model);
            this._moc.release();
            this._moc = null;
        }
        this._modelMatrix = null;
        CubismPose.delete(this._pose);
        CubismEyeBlink.delete(this._eyeBlink);
        CubismBreath.delete(this._breath);
        this._dragManager = null;
        CubismPhysics.delete(this._physics);
        CubismModelUserData.delete(this._modelUserData);
        this.deleteRenderer();
    }
    _moc;
    _model;
    _motionManager;
    _expressionManager;
    _eyeBlink;
    _breath;
    _modelMatrix;
    _pose;
    _dragManager;
    _physics;
    _modelUserData;
    _initialized;
    _updating;
    _opacity;
    _mocConsistency;
    _motionConsistency;
    _debugMode;
    _renderer;
}
import * as $ from './cubismusermodel.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.CubismUserModel = $.CubismUserModel;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
