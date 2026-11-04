import { ICubismUpdater, CubismUpdateOrder } from './icubismupdater.js';
import { CubismModel } from '../model/cubismmodel.js';
import { CubismPhysics } from '../physics/cubismphysics.js';
export class CubismPhysicsUpdater extends ICubismUpdater {
    _physics;
    constructor(physics, executionOrder){
        super(executionOrder ?? CubismUpdateOrder.CubismUpdateOrder_Physics);
        this._physics = physics;
    }
    onLateUpdate(model, deltaTimeSeconds) {
        if (!model) {
            return;
        }
        this._physics.evaluate(model, deltaTimeSeconds);
    }
}
import * as $ from './cubismphysicsupdater.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.CubismPhysicsUpdater = $.CubismPhysicsUpdater;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
