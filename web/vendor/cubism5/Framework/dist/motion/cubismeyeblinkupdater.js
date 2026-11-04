import { ICubismUpdater, CubismUpdateOrder } from './icubismupdater.js';
import { CubismModel } from '../model/cubismmodel.js';
import { CubismEyeBlink } from '../effect/cubismeyeblink.js';
export class CubismEyeBlinkUpdater extends ICubismUpdater {
    _motionUpdated;
    _eyeBlink;
    constructor(motionUpdated, eyeBlink, executionOrder){
        super(executionOrder ?? CubismUpdateOrder.CubismUpdateOrder_EyeBlink);
        this._motionUpdated = motionUpdated;
        this._eyeBlink = eyeBlink;
    }
    onLateUpdate(model, deltaTimeSeconds) {
        if (!model) {
            return;
        }
        if (!this._motionUpdated()) {
            this._eyeBlink.updateParameters(model, deltaTimeSeconds);
        }
    }
}
import * as $ from './cubismeyeblinkupdater.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.CubismEyeBlinkUpdater = $.CubismEyeBlinkUpdater;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
