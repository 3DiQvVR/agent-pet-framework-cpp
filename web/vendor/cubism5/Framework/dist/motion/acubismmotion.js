import { CubismMath } from '../math/cubismmath.js';
import { CubismModel } from '../model/cubismmodel.js';
import { CSM_ASSERT, CubismDebug } from '../utils/cubismdebug.js';
import { CubismMotionQueueEntry } from './cubismmotionqueueentry.js';
export class ACubismMotion {
    static delete(motion) {
        motion.release();
        motion = null;
    }
    constructor(){
        this._fadeInSeconds = -1.0;
        this._fadeOutSeconds = -1.0;
        this._weight = 1.0;
        this._offsetSeconds = 0.0;
        this._isLoop = false;
        this._isLoopFadeIn = true;
        this._previousLoopState = this._isLoop;
        this._firedEventValues = new Array();
    }
    release() {
        this._weight = 0.0;
    }
    updateParameters(model, motionQueueEntry, userTimeSeconds) {
        if (!motionQueueEntry.isAvailable() || motionQueueEntry.isFinished()) {
            return;
        }
        this.setupMotionQueueEntry(motionQueueEntry, userTimeSeconds);
        const fadeWeight = this.updateFadeWeight(motionQueueEntry, userTimeSeconds);
        this.doUpdateParameters(model, userTimeSeconds, fadeWeight, motionQueueEntry);
        if (motionQueueEntry.getEndTime() > 0 && motionQueueEntry.getEndTime() < userTimeSeconds) {
            motionQueueEntry.setIsFinished(true);
        }
    }
    setupMotionQueueEntry(motionQueueEntry, userTimeSeconds) {
        if (motionQueueEntry == null || motionQueueEntry.isStarted()) {
            return;
        }
        if (!motionQueueEntry.isAvailable()) {
            return;
        }
        motionQueueEntry.setIsStarted(true);
        motionQueueEntry.setStartTime(userTimeSeconds - this._offsetSeconds);
        motionQueueEntry.setFadeInStartTime(userTimeSeconds);
        if (motionQueueEntry.getEndTime() < 0.0) {
            this.adjustEndTime(motionQueueEntry);
        }
        if (motionQueueEntry._motion._onBeganMotion) {
            motionQueueEntry._motion._onBeganMotion(motionQueueEntry._motion);
        }
    }
    updateFadeWeight(motionQueueEntry, userTimeSeconds) {
        if (motionQueueEntry == null) {
            CubismDebug.print(LogLevel.LogLevel_Error, 'motionQueueEntry is null.');
        }
        let fadeWeight = this._weight;
        const fadeIn = this._fadeInSeconds == 0.0 ? 1.0 : CubismMath.getEasingSine((userTimeSeconds - motionQueueEntry.getFadeInStartTime()) / this._fadeInSeconds);
        const fadeOut = this._fadeOutSeconds == 0.0 || motionQueueEntry.getEndTime() < 0.0 ? 1.0 : CubismMath.getEasingSine((motionQueueEntry.getEndTime() - userTimeSeconds) / this._fadeOutSeconds);
        fadeWeight = fadeWeight * fadeIn * fadeOut;
        motionQueueEntry.setState(userTimeSeconds, fadeWeight);
        CSM_ASSERT(0.0 <= fadeWeight && fadeWeight <= 1.0);
        return fadeWeight;
    }
    setFadeInTime(fadeInSeconds) {
        this._fadeInSeconds = fadeInSeconds;
    }
    setFadeOutTime(fadeOutSeconds) {
        this._fadeOutSeconds = fadeOutSeconds;
    }
    getFadeOutTime() {
        return this._fadeOutSeconds;
    }
    getFadeInTime() {
        return this._fadeInSeconds;
    }
    setWeight(weight) {
        this._weight = weight;
    }
    getWeight() {
        return this._weight;
    }
    getDuration() {
        return -1.0;
    }
    getLoopDuration() {
        return -1.0;
    }
    setOffsetTime(offsetSeconds) {
        this._offsetSeconds = offsetSeconds;
    }
    setLoop(loop) {
        this._isLoop = loop;
    }
    getLoop() {
        return this._isLoop;
    }
    setLoopFadeIn(loopFadeIn) {
        this._isLoopFadeIn = loopFadeIn;
    }
    getLoopFadeIn() {
        return this._isLoopFadeIn;
    }
    getFiredEvent(beforeCheckTimeSeconds, motionTimeSeconds) {
        return this._firedEventValues;
    }
    setBeganMotionHandler = (onBeganMotionHandler)=>this._onBeganMotion = onBeganMotionHandler;
    getBeganMotionHandler = ()=>this._onBeganMotion;
    setFinishedMotionHandler = (onFinishedMotionHandler)=>this._onFinishedMotion = onFinishedMotionHandler;
    getFinishedMotionHandler = ()=>this._onFinishedMotion;
    isExistModelOpacity() {
        return false;
    }
    getModelOpacityIndex() {
        return -1;
    }
    getModelOpacityId(index) {
        return null;
    }
    getModelOpacityValue() {
        return 1.0;
    }
    adjustEndTime(motionQueueEntry) {
        const duration = this.getDuration();
        const endTime = duration <= 0.0 ? -1 : motionQueueEntry.getStartTime() + duration;
        motionQueueEntry.setEndTime(endTime);
    }
    _fadeInSeconds;
    _fadeOutSeconds;
    _weight;
    _offsetSeconds;
    _isLoop;
    _isLoopFadeIn;
    _previousLoopState;
    _firedEventValues;
    _onBeganMotion;
    _onFinishedMotion;
}
import * as $ from './acubismmotion.js';
import { CubismIdHandle } from '../id/cubismid.js';
import { LogLevel } from '../live2dcubismframework.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.ACubismMotion = $.ACubismMotion;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
