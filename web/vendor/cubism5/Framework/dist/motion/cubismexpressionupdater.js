import { ICubismUpdater, CubismUpdateOrder } from './icubismupdater.js';
import { CubismModel } from '../model/cubismmodel.js';
import { CubismExpressionMotionManager } from './cubismexpressionmotionmanager.js';
export class CubismExpressionUpdater extends ICubismUpdater {
    _expressionManager;
    constructor(expressionManager, executionOrder){
        super(executionOrder ?? CubismUpdateOrder.CubismUpdateOrder_Expression);
        this._expressionManager = expressionManager;
    }
    onLateUpdate(model, deltaTimeSeconds) {
        if (!model) {
            return;
        }
        this._expressionManager.updateMotion(model, deltaTimeSeconds);
    }
}
import * as $ from './cubismexpressionupdater.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.CubismExpressionUpdater = $.CubismExpressionUpdater;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
