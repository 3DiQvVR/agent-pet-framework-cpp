import { CubismId, CubismIdHandle } from '../id/cubismid.js';
import { LogLevel, csmDelete } from '../live2dcubismframework.js';
import { CubismModel } from '../model/cubismmodel.js';
import { CubismExpressionMotion } from './cubismexpressionmotion.js';
import { CubismMotionQueueEntry } from './cubismmotionqueueentry.js';
import { CubismMotionQueueManager } from './cubismmotionqueuemanager.js';
export class ExpressionParameterValue {
    parameterId;
    additiveValue;
    multiplyValue;
    overwriteValue;
}
export class CubismExpressionMotionManager extends CubismMotionQueueManager {
    constructor(){
        super();
        this._expressionParameterValues = new Array();
        this._fadeWeights = new Array();
    }
    release() {
        if (this._expressionParameterValues) {
            csmDelete(this._expressionParameterValues);
            this._expressionParameterValues = null;
        }
        if (this._fadeWeights) {
            csmDelete(this._fadeWeights);
            this._fadeWeights = null;
        }
    }
    getFadeWeight(index) {
        if (index < 0 || this._fadeWeights.length < 1 || index >= this._fadeWeights.length) {
            console.warn('Failed to get the fade weight value. The element at that index does not exist.');
            return -1;
        }
        return this._fadeWeights[index];
    }
    setFadeWeight(index, expressionFadeWeight) {
        if (index < 0 || this._fadeWeights.length < 1 || this._fadeWeights.length <= index) {
            console.warn('Failed to set the fade weight value. The element at that index does not exist.');
            return;
        }
        this._fadeWeights[index] = expressionFadeWeight;
    }
    updateMotion(model, deltaTimeSeconds) {
        this._userTimeSeconds += deltaTimeSeconds;
        let updated = false;
        const motions = this.getCubismMotionQueueEntries();
        let expressionWeight = 0.0;
        let expressionIndex = 0;
        if (this._fadeWeights.length !== motions.length) {
            const difference = motions.length - this._fadeWeights.length;
            let dstIndex = this._fadeWeights.length;
            this._fadeWeights.length += difference;
            for(let i = 0; i < difference; i++){
                this._fadeWeights[dstIndex++] = 0.0;
            }
        }
        for(let i = 0; i < this._motions.length;){
            const motionQueueEntry = this._motions[i];
            if (motionQueueEntry == null) {
                motions.splice(i, 1);
                continue;
            }
            const expressionMotion = motionQueueEntry.getCubismMotion();
            if (expressionMotion == null) {
                csmDelete(motionQueueEntry);
                motions.splice(i, 1);
                continue;
            }
            const expressionParameters = expressionMotion.getExpressionParameters();
            if (motionQueueEntry.isAvailable()) {
                for(let i = 0; i < expressionParameters.length; ++i){
                    if (expressionParameters[i].parameterId == null) {
                        continue;
                    }
                    let index = -1;
                    for(let j = 0; j < this._expressionParameterValues.length; ++j){
                        if (this._expressionParameterValues[j].parameterId != expressionParameters[i].parameterId) {
                            continue;
                        }
                        index = j;
                        break;
                    }
                    if (index >= 0) {
                        continue;
                    }
                    const item = new ExpressionParameterValue();
                    item.parameterId = expressionParameters[i].parameterId;
                    item.additiveValue = CubismExpressionMotion.DefaultAdditiveValue;
                    item.multiplyValue = CubismExpressionMotion.DefaultMultiplyValue;
                    item.overwriteValue = model.getParameterValueById(item.parameterId);
                    this._expressionParameterValues.push(item);
                }
            }
            expressionMotion.setupMotionQueueEntry(motionQueueEntry, this._userTimeSeconds);
            this.setFadeWeight(expressionIndex, expressionMotion.updateFadeWeight(motionQueueEntry, this._userTimeSeconds));
            expressionMotion.calculateExpressionParameters(model, this._userTimeSeconds, motionQueueEntry, this._expressionParameterValues, expressionIndex, this.getFadeWeight(expressionIndex));
            expressionWeight += expressionMotion.getFadeInTime() == 0.0 ? 1.0 : CubismMath.getEasingSine((this._userTimeSeconds - motionQueueEntry.getFadeInStartTime()) / expressionMotion.getFadeInTime());
            updated = true;
            if (motionQueueEntry.isTriggeredFadeOut()) {
                motionQueueEntry.startFadeOut(motionQueueEntry.getFadeOutSeconds(), this._userTimeSeconds);
            }
            ++i;
            ++expressionIndex;
        }
        if (motions.length > 1) {
            const latestFadeWeight = this.getFadeWeight(this._fadeWeights.length - 1);
            if (latestFadeWeight >= 1.0) {
                for(let i = motions.length - 2; i >= 0; --i){
                    const motionQueueEntry = motions[i];
                    csmDelete(motionQueueEntry);
                    motions.splice(i, 1);
                    this._fadeWeights.splice(i, 1);
                }
            }
        }
        if (expressionWeight > 1.0) {
            expressionWeight = 1.0;
        }
        for(let i = 0; i < this._expressionParameterValues.length; ++i){
            const expressionParameterValue = this._expressionParameterValues[i];
            model.setParameterValueById(expressionParameterValue.parameterId, (expressionParameterValue.overwriteValue + expressionParameterValue.additiveValue) * expressionParameterValue.multiplyValue, expressionWeight);
            expressionParameterValue.additiveValue = CubismExpressionMotion.DefaultAdditiveValue;
            expressionParameterValue.multiplyValue = CubismExpressionMotion.DefaultMultiplyValue;
        }
        return updated;
    }
    _expressionParameterValues;
    _fadeWeights;
    _startExpressionTime;
}
import * as $ from './cubismexpressionmotionmanager.js';
import { CubismMath } from '../math/cubismmath.js';
import { CubismDebug, CubismLogError } from '../utils/cubismdebug.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.CubismExpressionMotionManager = $.CubismExpressionMotionManager;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
