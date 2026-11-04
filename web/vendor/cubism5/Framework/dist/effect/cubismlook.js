import { CubismIdHandle } from '../id/cubismid.js';
import { CubismModel } from '../model/cubismmodel.js';
export class CubismLook {
    static create() {
        return new CubismLook();
    }
    static delete(instance) {
        if (instance != null) {
            instance = null;
        }
    }
    setParameters(lookParameters) {
        this._lookParameters = lookParameters;
    }
    getParameters() {
        return this._lookParameters;
    }
    updateParameters(model, dragX, dragY) {
        for(let i = 0; i < this._lookParameters.length; ++i){
            const data = this._lookParameters[i];
            model.addParameterValueById(data.parameterId, data.factorX * dragX + data.factorY * dragY + data.factorXY * dragX * dragY);
        }
    }
    constructor(){
        this._lookParameters = new Array();
    }
    _lookParameters;
}
export class LookParameterData {
    constructor(parameterId, factorX, factorY, factorXY){
        this.parameterId = parameterId == undefined ? null : parameterId;
        this.factorX = factorX == undefined ? 0.0 : factorX;
        this.factorY = factorY == undefined ? 0.0 : factorY;
        this.factorXY = factorXY == undefined ? 0.0 : factorXY;
    }
    parameterId;
    factorX;
    factorY;
    factorXY;
}
import * as $ from './cubismlook.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.LookParameterData = $.LookParameterData;
    Live2DCubismFramework.CubismLook = $.CubismLook;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
