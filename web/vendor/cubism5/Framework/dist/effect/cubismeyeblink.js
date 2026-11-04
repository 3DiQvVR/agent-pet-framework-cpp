import { ICubismModelSetting } from '../icubismmodelsetting.js';
import { CubismIdHandle } from '../id/cubismid.js';
import { CubismModel } from '../model/cubismmodel.js';
export class CubismEyeBlink {
    static create(modelSetting = null) {
        return new CubismEyeBlink(modelSetting);
    }
    static delete(eyeBlink) {
        if (eyeBlink != null) {
            eyeBlink = null;
        }
    }
    setBlinkingInterval(blinkingInterval) {
        this._blinkingIntervalSeconds = blinkingInterval;
    }
    setBlinkingSetting(closing, closed, opening) {
        this._closingSeconds = closing;
        this._closedSeconds = closed;
        this._openingSeconds = opening;
    }
    setParameterIds(parameterIds) {
        this._parameterIds = parameterIds;
    }
    getParameterIds() {
        return this._parameterIds;
    }
    updateParameters(model, deltaTimeSeconds) {
        this._userTimeSeconds += deltaTimeSeconds;
        let parameterValue;
        let t = 0.0;
        const blinkingState = this._blinkingState;
        switch(blinkingState){
            case 2:
                t = (this._userTimeSeconds - this._stateStartTimeSeconds) / this._closingSeconds;
                if (t >= 1.0) {
                    t = 1.0;
                    this._blinkingState = 3;
                    this._stateStartTimeSeconds = this._userTimeSeconds;
                }
                parameterValue = 1.0 - t;
                break;
            case 3:
                t = (this._userTimeSeconds - this._stateStartTimeSeconds) / this._closedSeconds;
                if (t >= 1.0) {
                    this._blinkingState = 4;
                    this._stateStartTimeSeconds = this._userTimeSeconds;
                }
                parameterValue = 0.0;
                break;
            case 4:
                t = (this._userTimeSeconds - this._stateStartTimeSeconds) / this._openingSeconds;
                if (t >= 1.0) {
                    t = 1.0;
                    this._blinkingState = 1;
                    this._nextBlinkingTime = this.determinNextBlinkingTiming();
                }
                parameterValue = t;
                break;
            case 1:
                if (this._nextBlinkingTime < this._userTimeSeconds) {
                    this._blinkingState = 2;
                    this._stateStartTimeSeconds = this._userTimeSeconds;
                }
                parameterValue = 1.0;
                break;
            case 0:
            default:
                this._blinkingState = 1;
                this._nextBlinkingTime = this.determinNextBlinkingTiming();
                parameterValue = 1.0;
                break;
        }
        if (!CubismEyeBlink.CloseIfZero) {
            parameterValue = -parameterValue;
        }
        for(let i = 0; i < this._parameterIds.length; ++i){
            model.setParameterValueById(this._parameterIds[i], parameterValue);
        }
    }
    constructor(modelSetting){
        this._blinkingState = 0;
        this._nextBlinkingTime = 0.0;
        this._stateStartTimeSeconds = 0.0;
        this._blinkingIntervalSeconds = 4.0;
        this._closingSeconds = 0.1;
        this._closedSeconds = 0.05;
        this._openingSeconds = 0.15;
        this._userTimeSeconds = 0.0;
        this._parameterIds = new Array();
        if (modelSetting == null) {
            return;
        }
        this._parameterIds.length = modelSetting.getEyeBlinkParameterCount();
        for(let i = 0; i < modelSetting.getEyeBlinkParameterCount(); ++i){
            this._parameterIds[i] = modelSetting.getEyeBlinkParameterId(i);
        }
    }
    determinNextBlinkingTiming() {
        const r = Math.random();
        return this._userTimeSeconds + r * (2.0 * this._blinkingIntervalSeconds - 1.0);
    }
    _blinkingState;
    _parameterIds;
    _nextBlinkingTime;
    _stateStartTimeSeconds;
    _blinkingIntervalSeconds;
    _closingSeconds;
    _closedSeconds;
    _openingSeconds;
    _userTimeSeconds;
    static CloseIfZero = true;
}
export var EyeState = /*#__PURE__*/ function(EyeState) {
    EyeState[EyeState["EyeState_First"] = 0] = "EyeState_First";
    EyeState[EyeState["EyeState_Interval"] = 1] = "EyeState_Interval";
    EyeState[EyeState["EyeState_Closing"] = 2] = "EyeState_Closing";
    EyeState[EyeState["EyeState_Closed"] = 3] = "EyeState_Closed";
    EyeState[EyeState["EyeState_Opening"] = 4] = "EyeState_Opening";
    return EyeState;
}({});
import * as $ from './cubismeyeblink.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.CubismEyeBlink = $.CubismEyeBlink;
    Live2DCubismFramework.EyeState = $.EyeState;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
