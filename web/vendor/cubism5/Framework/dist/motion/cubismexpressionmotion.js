import { CubismIdHandle } from '../id/cubismid.js';
import { CubismFramework } from '../live2dcubismframework.js';
import { CubismModel } from '../model/cubismmodel.js';
import { CubismJson, Value } from '../utils/cubismjson.js';
import { ACubismMotion } from './acubismmotion.js';
import { CubismMotionQueueEntry } from './cubismmotionqueueentry.js';
const ExpressionKeyFadeIn = 'FadeInTime';
const ExpressionKeyFadeOut = 'FadeOutTime';
const ExpressionKeyParameters = 'Parameters';
const ExpressionKeyId = 'Id';
const ExpressionKeyValue = 'Value';
const ExpressionKeyBlend = 'Blend';
const BlendValueAdd = 'Add';
const BlendValueMultiply = 'Multiply';
const BlendValueOverwrite = 'Overwrite';
const DefaultFadeTime = 1.0;
export class CubismExpressionMotion extends ACubismMotion {
    static DefaultAdditiveValue = 0.0;
    static DefaultMultiplyValue = 1.0;
    static create(buffer, size) {
        const expression = new CubismExpressionMotion();
        expression.parse(buffer, size);
        return expression;
    }
    doUpdateParameters(model, userTimeSeconds, weight, motionQueueEntry) {
        for(let i = 0; i < this._parameters.length; ++i){
            const parameter = this._parameters[i];
            switch(parameter.blendType){
                case 0:
                    {
                        model.addParameterValueById(parameter.parameterId, parameter.value, weight);
                        break;
                    }
                case 1:
                    {
                        model.multiplyParameterValueById(parameter.parameterId, parameter.value, weight);
                        break;
                    }
                case 2:
                    {
                        model.setParameterValueById(parameter.parameterId, parameter.value, weight);
                        break;
                    }
                default:
                    break;
            }
        }
    }
    calculateExpressionParameters(model, userTimeSeconds, motionQueueEntry, expressionParameterValues, expressionIndex, fadeWeight) {
        if (motionQueueEntry == null || expressionParameterValues == null) {
            return;
        }
        if (!motionQueueEntry.isAvailable()) {
            return;
        }
        for(let i = 0; i < expressionParameterValues.length; ++i){
            const expressionParameterValue = expressionParameterValues[i];
            if (expressionParameterValue.parameterId == null) {
                continue;
            }
            const currentParameterValue = expressionParameterValue.overwriteValue = model.getParameterValueById(expressionParameterValue.parameterId);
            const expressionParameters = this.getExpressionParameters();
            let parameterIndex = -1;
            for(let j = 0; j < expressionParameters.length; ++j){
                if (expressionParameterValue.parameterId != expressionParameters[j].parameterId) {
                    continue;
                }
                parameterIndex = j;
                break;
            }
            if (parameterIndex < 0) {
                if (expressionIndex == 0) {
                    expressionParameterValue.additiveValue = CubismExpressionMotion.DefaultAdditiveValue;
                    expressionParameterValue.multiplyValue = CubismExpressionMotion.DefaultMultiplyValue;
                    expressionParameterValue.overwriteValue = currentParameterValue;
                } else {
                    expressionParameterValue.additiveValue = this.calculateValue(expressionParameterValue.additiveValue, CubismExpressionMotion.DefaultAdditiveValue, fadeWeight);
                    expressionParameterValue.multiplyValue = this.calculateValue(expressionParameterValue.multiplyValue, CubismExpressionMotion.DefaultMultiplyValue, fadeWeight);
                    expressionParameterValue.overwriteValue = this.calculateValue(expressionParameterValue.overwriteValue, currentParameterValue, fadeWeight);
                }
                continue;
            }
            const value = expressionParameters[parameterIndex].value;
            let newAdditiveValue, newMultiplyValue, newOverwriteValue;
            switch(expressionParameters[parameterIndex].blendType){
                case 0:
                    newAdditiveValue = value;
                    newMultiplyValue = CubismExpressionMotion.DefaultMultiplyValue;
                    newOverwriteValue = currentParameterValue;
                    break;
                case 1:
                    newAdditiveValue = CubismExpressionMotion.DefaultAdditiveValue;
                    newMultiplyValue = value;
                    newOverwriteValue = currentParameterValue;
                    break;
                case 2:
                    newAdditiveValue = CubismExpressionMotion.DefaultAdditiveValue;
                    newMultiplyValue = CubismExpressionMotion.DefaultMultiplyValue;
                    newOverwriteValue = value;
                    break;
                default:
                    return;
            }
            if (expressionIndex == 0) {
                expressionParameterValue.additiveValue = newAdditiveValue;
                expressionParameterValue.multiplyValue = newMultiplyValue;
                expressionParameterValue.overwriteValue = newOverwriteValue;
            } else {
                expressionParameterValue.additiveValue = expressionParameterValue.additiveValue * (1.0 - fadeWeight) + newAdditiveValue * fadeWeight;
                expressionParameterValue.multiplyValue = expressionParameterValue.multiplyValue * (1.0 - fadeWeight) + newMultiplyValue * fadeWeight;
                expressionParameterValue.overwriteValue = expressionParameterValue.overwriteValue * (1.0 - fadeWeight) + newOverwriteValue * fadeWeight;
            }
        }
    }
    getExpressionParameters() {
        return this._parameters;
    }
    parse(buffer, size) {
        const json = CubismJson.create(buffer, size);
        if (!json) {
            return;
        }
        const root = json.getRoot();
        this.setFadeInTime(root.getValueByString(ExpressionKeyFadeIn).toFloat(DefaultFadeTime));
        this.setFadeOutTime(root.getValueByString(ExpressionKeyFadeOut).toFloat(DefaultFadeTime));
        const parameterCount = root.getValueByString(ExpressionKeyParameters).getSize();
        let dstIndex = this._parameters.length;
        this._parameters.length += parameterCount;
        for(let i = 0; i < parameterCount; ++i){
            const param = root.getValueByString(ExpressionKeyParameters).getValueByIndex(i);
            const parameterId = CubismFramework.getIdManager().getId(param.getValueByString(ExpressionKeyId).getRawString());
            const value = param.getValueByString(ExpressionKeyValue).toFloat();
            let blendType;
            if (param.getValueByString(ExpressionKeyBlend).isNull() || param.getValueByString(ExpressionKeyBlend).getString() == BlendValueAdd) {
                blendType = 0;
            } else if (param.getValueByString(ExpressionKeyBlend).getString() == BlendValueMultiply) {
                blendType = 1;
            } else if (param.getValueByString(ExpressionKeyBlend).getString() == BlendValueOverwrite) {
                blendType = 2;
            } else {
                blendType = 0;
            }
            const item = new ExpressionParameter();
            item.parameterId = parameterId;
            item.blendType = blendType;
            item.value = value;
            this._parameters[dstIndex++] = item;
        }
        CubismJson.delete(json);
    }
    calculateValue(source, destination, fadeWeight) {
        return source * (1.0 - fadeWeight) + destination * fadeWeight;
    }
    constructor(){
        super();
        this._parameters = new Array();
    }
    _parameters;
}
export var ExpressionBlendType = /*#__PURE__*/ function(ExpressionBlendType) {
    ExpressionBlendType[ExpressionBlendType["Additive"] = 0] = "Additive";
    ExpressionBlendType[ExpressionBlendType["Multiply"] = 1] = "Multiply";
    ExpressionBlendType[ExpressionBlendType["Overwrite"] = 2] = "Overwrite";
    return ExpressionBlendType;
}({});
export class ExpressionParameter {
    parameterId;
    blendType;
    value;
}
import * as $ from './cubismexpressionmotion.js';
import { ExpressionParameterValue } from './cubismexpressionmotionmanager.js';
import { CubismDefaultParameterId } from '../cubismdefaultparameterid.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.CubismExpressionMotion = $.CubismExpressionMotion;
    Live2DCubismFramework.ExpressionBlendType = $.ExpressionBlendType;
    Live2DCubismFramework.ExpressionParameter = $.ExpressionParameter;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
