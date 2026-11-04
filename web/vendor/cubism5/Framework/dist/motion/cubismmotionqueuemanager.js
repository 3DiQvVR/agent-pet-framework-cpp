import { ACubismMotion } from './acubismmotion.js';
import { CubismMotionQueueEntry } from './cubismmotionqueueentry.js';
import { CubismModel } from '../model/cubismmodel.js';
export class CubismMotionQueueManager {
    constructor(){
        this._userTimeSeconds = 0.0;
        this._eventCallBack = null;
        this._eventCustomData = null;
        this._motions = new Array();
    }
    release() {
        for(let i = 0; i < this._motions.length; ++i){
            if (this._motions[i]) {
                this._motions[i].release();
                this._motions[i] = null;
            }
        }
        this._motions = null;
    }
    startMotion(motion, autoDelete, userTimeSeconds) {
        if (motion == null) {
            return InvalidMotionQueueEntryHandleValue;
        }
        let motionQueueEntry = null;
        for(let i = 0; i < this._motions.length; ++i){
            motionQueueEntry = this._motions[i];
            if (motionQueueEntry == null) {
                continue;
            }
            motionQueueEntry.setFadeOut(motionQueueEntry._motion.getFadeOutTime());
        }
        motionQueueEntry = new CubismMotionQueueEntry();
        motionQueueEntry._autoDelete = autoDelete;
        motionQueueEntry._motion = motion;
        this._motions.push(motionQueueEntry);
        return motionQueueEntry._motionQueueEntryHandle;
    }
    isFinished() {
        for(let i = 0; i < this._motions.length;){
            let motionQueueEntry = this._motions[i];
            if (motionQueueEntry == null) {
                this._motions.splice(i, 1);
                continue;
            }
            const motion = motionQueueEntry._motion;
            if (motion == null) {
                motionQueueEntry.release();
                motionQueueEntry = null;
                this._motions.splice(i, 1);
                continue;
            }
            if (!motionQueueEntry.isFinished()) {
                return false;
            } else {
                i++;
            }
        }
        return true;
    }
    isFinishedByHandle(motionQueueEntryNumber) {
        for(let i = 0; i < this._motions.length; i++){
            const motionQueueEntry = this._motions[i];
            if (motionQueueEntry == null) {
                continue;
            }
            if (motionQueueEntry._motionQueueEntryHandle == motionQueueEntryNumber && !motionQueueEntry.isFinished()) {
                return false;
            }
        }
        return true;
    }
    stopAllMotions() {
        for(let i = 0; i < this._motions.length; i++){
            const motionQueueEntry = this._motions[i];
            if (motionQueueEntry == null) {
                this._motions.splice(i, 1);
                continue;
            }
            motionQueueEntry.release();
            this._motions.splice(i, 1);
            continue;
        }
    }
    getCubismMotionQueueEntries() {
        return this._motions;
    }
    getCubismMotionQueueEntry(motionQueueEntryNumber) {
        for(let i = 0; i < this._motions.length; i++){
            const motionQueueEntry = this._motions[i];
            if (motionQueueEntry == null) {
                continue;
            }
            if (motionQueueEntry._motionQueueEntryHandle == motionQueueEntryNumber) {
                return motionQueueEntry;
            }
        }
        return null;
    }
    setEventCallback(callback, customData = null) {
        this._eventCallBack = callback;
        this._eventCustomData = customData;
    }
    doUpdateMotion(model, userTimeSeconds) {
        let updated = false;
        for(let i = 0; i < this._motions.length;){
            let motionQueueEntry = this._motions[i];
            if (motionQueueEntry == null) {
                this._motions.splice(i, 1);
                continue;
            }
            const motion = motionQueueEntry._motion;
            if (motion == null) {
                motionQueueEntry.release();
                motionQueueEntry = null;
                this._motions.splice(i, 1);
                continue;
            }
            motion.updateParameters(model, motionQueueEntry, userTimeSeconds);
            updated = true;
            const firedList = motion.getFiredEvent(motionQueueEntry.getLastCheckEventSeconds() - motionQueueEntry.getStartTime(), userTimeSeconds - motionQueueEntry.getStartTime());
            for(let i = 0; i < firedList.length; ++i){
                this._eventCallBack(this, firedList[i], this._eventCustomData);
            }
            motionQueueEntry.setLastCheckEventSeconds(userTimeSeconds);
            if (motionQueueEntry.isFinished()) {
                motionQueueEntry.release();
                motionQueueEntry = null;
                this._motions.splice(i, 1);
            } else {
                if (motionQueueEntry.isTriggeredFadeOut()) {
                    motionQueueEntry.startFadeOut(motionQueueEntry.getFadeOutSeconds(), userTimeSeconds);
                }
                i++;
            }
        }
        return updated;
    }
    _userTimeSeconds;
    _motions;
    _eventCallBack;
    _eventCustomData;
}
export const InvalidMotionQueueEntryHandleValue = -1;
import * as $ from './cubismmotionqueuemanager.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.CubismMotionQueueManager = $.CubismMotionQueueManager;
    Live2DCubismFramework.InvalidMotionQueueEntryHandleValue = $.InvalidMotionQueueEntryHandleValue;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
