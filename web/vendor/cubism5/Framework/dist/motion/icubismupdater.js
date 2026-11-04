import { CubismModel } from '../model/cubismmodel.js';
export var CubismUpdateOrder = function(CubismUpdateOrder) {
    CubismUpdateOrder[CubismUpdateOrder["CubismUpdateOrder_EyeBlink"] = 200] = "CubismUpdateOrder_EyeBlink";
    CubismUpdateOrder[CubismUpdateOrder["CubismUpdateOrder_Expression"] = 300] = "CubismUpdateOrder_Expression";
    CubismUpdateOrder[CubismUpdateOrder["CubismUpdateOrder_Drag"] = 400] = "CubismUpdateOrder_Drag";
    CubismUpdateOrder[CubismUpdateOrder["CubismUpdateOrder_Breath"] = 500] = "CubismUpdateOrder_Breath";
    CubismUpdateOrder[CubismUpdateOrder["CubismUpdateOrder_Physics"] = 600] = "CubismUpdateOrder_Physics";
    CubismUpdateOrder[CubismUpdateOrder["CubismUpdateOrder_LipSync"] = 700] = "CubismUpdateOrder_LipSync";
    CubismUpdateOrder[CubismUpdateOrder["CubismUpdateOrder_Pose"] = 800] = "CubismUpdateOrder_Pose";
    CubismUpdateOrder[CubismUpdateOrder["CubismUpdateOrder_Max"] = Number.MAX_SAFE_INTEGER] = "CubismUpdateOrder_Max";
    return CubismUpdateOrder;
}({});
export class ICubismUpdater {
    static sortFunction(left, right) {
        if (!left || !right) {
            if (!left && !right) return 0;
            if (!left) return 1;
            if (!right) return -1;
        }
        return left.getExecutionOrder() - right.getExecutionOrder();
    }
    _executionOrder;
    _changeListeners = [];
    constructor(executionOrder = 0){
        this._executionOrder = executionOrder;
    }
    getExecutionOrder() {
        return this._executionOrder;
    }
    setExecutionOrder(executionOrder) {
        if (this._executionOrder !== executionOrder) {
            this._executionOrder = executionOrder;
            this.notifyChangeListeners();
        }
    }
    addChangeListener(listener) {
        if (listener && this._changeListeners.indexOf(listener) === -1) {
            this._changeListeners.push(listener);
        }
    }
    removeChangeListener(listener) {
        const index = this._changeListeners.indexOf(listener);
        if (index >= 0) {
            this._changeListeners.splice(index, 1);
        }
    }
    notifyChangeListeners() {
        for (const listener of this._changeListeners){
            listener.onUpdaterChanged(this);
        }
    }
}
import * as $ from './icubismupdater.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.ICubismUpdater = $.ICubismUpdater;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
