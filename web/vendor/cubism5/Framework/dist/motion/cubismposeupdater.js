import { ICubismUpdater, CubismUpdateOrder } from './icubismupdater.js';
import { CubismModel } from '../model/cubismmodel.js';
import { CubismPose } from '../effect/cubismpose.js';
export class CubismPoseUpdater extends ICubismUpdater {
    _pose;
    constructor(pose, executionOrder){
        super(executionOrder ?? CubismUpdateOrder.CubismUpdateOrder_Pose);
        this._pose = pose;
    }
    onLateUpdate(model, deltaTimeSeconds) {
        if (!model) {
            return;
        }
        this._pose.updateParameters(model, deltaTimeSeconds);
    }
}
import * as $ from './cubismposeupdater.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.CubismPoseUpdater = $.CubismPoseUpdater;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
