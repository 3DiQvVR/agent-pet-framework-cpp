import { ICubismUpdater, CubismUpdateOrder } from './icubismupdater.js';
import { CubismModel } from '../model/cubismmodel.js';
import { CubismTargetPoint } from '../math/cubismtargetpoint.js';
import { CubismLook } from '../effect/cubismlook.js';
export class CubismLookUpdater extends ICubismUpdater {
    _look;
    _dragManager;
    constructor(look, dragManager, executionOrder){
        super(executionOrder ?? CubismUpdateOrder.CubismUpdateOrder_Drag);
        this._look = look;
        this._dragManager = dragManager;
    }
    onLateUpdate(model, deltaTimeSeconds) {
        if (!model) {
            return;
        }
        this._dragManager.update(deltaTimeSeconds);
        const dragX = this._dragManager.getX();
        const dragY = this._dragManager.getY();
        this._look.updateParameters(model, dragX, dragY);
    }
}
import * as $ from './cubismlookupdater.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.CubismLookUpdater = $.CubismLookUpdater;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
