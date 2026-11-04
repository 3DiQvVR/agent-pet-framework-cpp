import { ICubismUpdater, CubismUpdateOrder } from './icubismupdater.js';
import { CubismModel } from '../model/cubismmodel.js';
import { CubismBreath } from '../effect/cubismbreath.js';
export class CubismBreathUpdater extends ICubismUpdater {
    _breath;
    constructor(breath, executionOrder){
        super(executionOrder ?? CubismUpdateOrder.CubismUpdateOrder_Breath);
        this._breath = breath;
    }
    onLateUpdate(model, deltaTimeSeconds) {
        if (!model) {
            return;
        }
        this._breath.updateParameters(model, deltaTimeSeconds);
    }
}
import * as $ from './cubismbreathupdater.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.CubismBreathUpdater = $.CubismBreathUpdater;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
