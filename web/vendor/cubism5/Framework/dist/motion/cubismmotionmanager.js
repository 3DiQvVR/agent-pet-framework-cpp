import { CubismModel } from '../model/cubismmodel.js';
import { ACubismMotion } from './acubismmotion.js';
import { CubismMotionQueueEntryHandle, CubismMotionQueueManager } from './cubismmotionqueuemanager.js';
export class CubismMotionManager extends CubismMotionQueueManager {
    constructor(){
        super();
        this._currentPriority = 0;
        this._reservePriority = 0;
    }
    getCurrentPriority() {
        return this._currentPriority;
    }
    getReservePriority() {
        return this._reservePriority;
    }
    setReservePriority(val) {
        this._reservePriority = val;
    }
    startMotionPriority(motion, autoDelete, priority) {
        if (priority == this._reservePriority) {
            this._reservePriority = 0;
        }
        this._currentPriority = priority;
        return super.startMotion(motion, autoDelete);
    }
    updateMotion(model, deltaTimeSeconds) {
        this._userTimeSeconds += deltaTimeSeconds;
        const updated = super.doUpdateMotion(model, this._userTimeSeconds);
        if (this.isFinished()) {
            this._currentPriority = 0;
        }
        return updated;
    }
    reserveMotion(priority) {
        if (priority <= this._reservePriority || priority <= this._currentPriority) {
            return false;
        }
        this._reservePriority = priority;
        return true;
    }
    _currentPriority;
    _reservePriority;
}
import * as $ from './cubismmotionmanager.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.CubismMotionManager = $.CubismMotionManager;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
