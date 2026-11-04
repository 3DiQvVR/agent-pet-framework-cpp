import { CubismIdHandle } from '../id/cubismid.js';
import { CubismFramework } from '../live2dcubismframework.js';
import { CubismMath } from '../math/cubismmath.js';
import { CubismBlendMode, CubismTextureColor } from '../rendering/cubismrenderer.js';
import { CSM_ASSERT } from '../utils/cubismdebug.js';
import { CubismModelMultiplyAndScreenColor } from './cubismmodelmultiplyandscreencolor.js';
export const NoParentIndex = -1;
export const NoOffscreenIndex = -1;
export var CubismColorBlend = function(CubismColorBlend) {
    CubismColorBlend[CubismColorBlend["ColorBlend_None"] = -1] = "ColorBlend_None";
    CubismColorBlend[CubismColorBlend["ColorBlend_Normal"] = Live2DCubismCore.ColorBlendType_Normal] = "ColorBlend_Normal";
    CubismColorBlend[CubismColorBlend["ColorBlend_AddGlow"] = Live2DCubismCore.ColorBlendType_AddGlow] = "ColorBlend_AddGlow";
    CubismColorBlend[CubismColorBlend["ColorBlend_Add"] = Live2DCubismCore.ColorBlendType_Add] = "ColorBlend_Add";
    CubismColorBlend[CubismColorBlend["ColorBlend_Darken"] = Live2DCubismCore.ColorBlendType_Darken] = "ColorBlend_Darken";
    CubismColorBlend[CubismColorBlend["ColorBlend_Multiply"] = Live2DCubismCore.ColorBlendType_Multiply] = "ColorBlend_Multiply";
    CubismColorBlend[CubismColorBlend["ColorBlend_ColorBurn"] = Live2DCubismCore.ColorBlendType_ColorBurn] = "ColorBlend_ColorBurn";
    CubismColorBlend[CubismColorBlend["ColorBlend_LinearBurn"] = Live2DCubismCore.ColorBlendType_LinearBurn] = "ColorBlend_LinearBurn";
    CubismColorBlend[CubismColorBlend["ColorBlend_Lighten"] = Live2DCubismCore.ColorBlendType_Lighten] = "ColorBlend_Lighten";
    CubismColorBlend[CubismColorBlend["ColorBlend_Screen"] = Live2DCubismCore.ColorBlendType_Screen] = "ColorBlend_Screen";
    CubismColorBlend[CubismColorBlend["ColorBlend_ColorDodge"] = Live2DCubismCore.ColorBlendType_ColorDodge] = "ColorBlend_ColorDodge";
    CubismColorBlend[CubismColorBlend["ColorBlend_Overlay"] = Live2DCubismCore.ColorBlendType_Overlay] = "ColorBlend_Overlay";
    CubismColorBlend[CubismColorBlend["ColorBlend_SoftLight"] = Live2DCubismCore.ColorBlendType_SoftLight] = "ColorBlend_SoftLight";
    CubismColorBlend[CubismColorBlend["ColorBlend_HardLight"] = Live2DCubismCore.ColorBlendType_HardLight] = "ColorBlend_HardLight";
    CubismColorBlend[CubismColorBlend["ColorBlend_LinearLight"] = Live2DCubismCore.ColorBlendType_LinearLight] = "ColorBlend_LinearLight";
    CubismColorBlend[CubismColorBlend["ColorBlend_Hue"] = Live2DCubismCore.ColorBlendType_Hue] = "ColorBlend_Hue";
    CubismColorBlend[CubismColorBlend["ColorBlend_Color"] = Live2DCubismCore.ColorBlendType_Color] = "ColorBlend_Color";
    CubismColorBlend[CubismColorBlend["ColorBlend_AddCompatible"] = Live2DCubismCore.ColorBlendType_AddCompatible] = "ColorBlend_AddCompatible";
    CubismColorBlend[CubismColorBlend["ColorBlend_MultiplyCompatible"] = Live2DCubismCore.ColorBlendType_MultiplyCompatible] = "ColorBlend_MultiplyCompatible";
    return CubismColorBlend;
}({});
export var CubismAlphaBlend = /*#__PURE__*/ function(CubismAlphaBlend) {
    CubismAlphaBlend[CubismAlphaBlend["AlphaBlend_None"] = -1] = "AlphaBlend_None";
    CubismAlphaBlend[CubismAlphaBlend["AlphaBlend_Over"] = 0] = "AlphaBlend_Over";
    CubismAlphaBlend[CubismAlphaBlend["AlphaBlend_Atop"] = 1] = "AlphaBlend_Atop";
    CubismAlphaBlend[CubismAlphaBlend["AlphaBlend_Out"] = 2] = "AlphaBlend_Out";
    CubismAlphaBlend[CubismAlphaBlend["AlphaBlend_ConjointOver"] = 3] = "AlphaBlend_ConjointOver";
    CubismAlphaBlend[CubismAlphaBlend["AlphaBlend_DisjointOver"] = 4] = "AlphaBlend_DisjointOver";
    return CubismAlphaBlend;
}({});
export var CubismModelObjectType = /*#__PURE__*/ function(CubismModelObjectType) {
    CubismModelObjectType[CubismModelObjectType["CubismModelObjectType_Drawable"] = 0] = "CubismModelObjectType_Drawable";
    CubismModelObjectType[CubismModelObjectType["CubismModelObjectType_Parts"] = 1] = "CubismModelObjectType_Parts";
    return CubismModelObjectType;
}({});
export class ParameterRepeatData {
    constructor(isOverridden = false, isParameterRepeated = false){
        this.isOverridden = isOverridden;
        this.isParameterRepeated = isParameterRepeated;
    }
    isOverridden;
    isParameterRepeated;
}
export class DrawableCullingData {
    constructor(isOverridden = false, isCulling = false){
        this.isOverridden = isOverridden;
        this.isCulling = isCulling;
    }
    isOverridden;
    isCulling;
    get isOverwritten() {
        return this.isOverridden;
    }
}
export class CullingData {
    constructor(isOverridden = false, isCulling = false){
        this.isOverridden = isOverridden;
        this.isCulling = isCulling;
    }
    isOverridden;
    isCulling;
}
export class PartChildDrawObjects {
    drawableIndices;
    offscreenIndices;
    constructor(drawableIndices = new Array(), offscreenIndices = new Array()){
        this.drawableIndices = drawableIndices;
        this.offscreenIndices = offscreenIndices;
    }
}
export class CubismModelObjectInfo {
    objectType;
    objectIndex;
    constructor(objectIndex, objectType){
        this.objectIndex = objectIndex;
        this.objectType = objectType;
    }
}
export class CubismModelPartInfo {
    objects;
    childDrawObjects;
    constructor(objects = new Array(), childDrawObjects = new PartChildDrawObjects()){
        this.objects = objects;
        this.childDrawObjects = childDrawObjects;
    }
    getChildObjectCount() {
        return this.objects.length;
    }
}
export class CubismModel {
    update() {
        this._model.update();
        this._model.drawables.resetDynamicFlags();
    }
    getPixelsPerUnit() {
        if (this._model == null) {
            return 0.0;
        }
        return this._model.canvasinfo.PixelsPerUnit;
    }
    getCanvasWidth() {
        if (this._model == null) {
            return 0.0;
        }
        return this._model.canvasinfo.CanvasWidth / this._model.canvasinfo.PixelsPerUnit;
    }
    getCanvasHeight() {
        if (this._model == null) {
            return 0.0;
        }
        return this._model.canvasinfo.CanvasHeight / this._model.canvasinfo.PixelsPerUnit;
    }
    saveParameters() {
        const parameterCount = this._model.parameters.count;
        const savedParameterCount = this._savedParameters.length;
        for(let i = 0; i < parameterCount; ++i){
            if (i < savedParameterCount) {
                this._savedParameters[i] = this._parameterValues[i];
            } else {
                this._savedParameters.push(this._parameterValues[i]);
            }
        }
    }
    getOverrideMultiplyAndScreenColor() {
        return this._overrideMultiplyAndScreenColor;
    }
    getOverrideFlagForModelParameterRepeat() {
        return this._isOverriddenParameterRepeat;
    }
    setOverrideFlagForModelParameterRepeat(isRepeat) {
        this._isOverriddenParameterRepeat = isRepeat;
    }
    getOverrideFlagForParameterRepeat(parameterIndex) {
        return this._userParameterRepeatDataList[parameterIndex].isOverridden;
    }
    setOverrideFlagForParameterRepeat(parameterIndex, value) {
        this._userParameterRepeatDataList[parameterIndex].isOverridden = value;
    }
    getRepeatFlagForParameterRepeat(parameterIndex) {
        return this._userParameterRepeatDataList[parameterIndex].isParameterRepeated;
    }
    setRepeatFlagForParameterRepeat(parameterIndex, value) {
        this._userParameterRepeatDataList[parameterIndex].isParameterRepeated = value;
    }
    getDrawableCulling(drawableIndex) {
        if (this.getOverrideFlagForModelCullings() || this.getOverrideFlagForDrawableCullings(drawableIndex)) {
            return this._userDrawableCullings[drawableIndex].isCulling;
        }
        const constantFlags = this._model.drawables.constantFlags;
        return !Live2DCubismCore.Utils.hasIsDoubleSidedBit(constantFlags[drawableIndex]);
    }
    setDrawableCulling(drawableIndex, isCulling) {
        this._userDrawableCullings[drawableIndex].isCulling = isCulling;
    }
    getOffscreenCulling(offscreenIndex) {
        if (this.getOverrideFlagForModelCullings() || this.getOverrideFlagForOffscreenCullings(offscreenIndex)) {
            return this._userOffscreenCullings[offscreenIndex].isCulling;
        }
        const constantFlags = this._model.offscreens.constantFlags;
        return !Live2DCubismCore.Utils.hasIsDoubleSidedBit(constantFlags[offscreenIndex]);
    }
    setOffscreenCulling(offscreenIndex, isCulling) {
        this._userOffscreenCullings[offscreenIndex].isCulling = isCulling;
    }
    getOverrideFlagForModelCullings() {
        return this._isOverriddenCullings;
    }
    setOverrideFlagForModelCullings(isOverriddenCullings) {
        this._isOverriddenCullings = isOverriddenCullings;
    }
    getOverrideFlagForDrawableCullings(drawableIndex) {
        return this._userDrawableCullings[drawableIndex].isOverridden;
    }
    getOverrideFlagForOffscreenCullings(offscreenIndex) {
        return this._userOffscreenCullings[offscreenIndex].isOverridden;
    }
    setOverrideFlagForDrawableCullings(drawableIndex, isOverriddenCullings) {
        this._userDrawableCullings[drawableIndex].isOverridden = isOverriddenCullings;
    }
    getModelOapcity() {
        return this._modelOpacity;
    }
    setModelOapcity(value) {
        this._modelOpacity = value;
    }
    getModel() {
        return this._model;
    }
    getPartIndex(partId) {
        let partIndex;
        const partCount = this._model.parts.count;
        for(partIndex = 0; partIndex < partCount; ++partIndex){
            if (partId == this._partIds[partIndex]) {
                return partIndex;
            }
        }
        if (this._notExistPartId.has(partId)) {
            return this._notExistPartId.get(partId);
        }
        partIndex = partCount + this._notExistPartId.size;
        this._notExistPartId.set(partId, partIndex);
        this._notExistPartOpacities.set(partIndex, null);
        return partIndex;
    }
    getPartId(partIndex) {
        const partId = this._model.parts.ids[partIndex];
        return CubismFramework.getIdManager().getId(partId);
    }
    getPartCount() {
        const partCount = this._model.parts.count;
        return partCount;
    }
    getPartOffscreenIndices() {
        const offscreenIndices = this._model.parts.offscreenIndices;
        return offscreenIndices;
    }
    getPartParentPartIndices() {
        const parentIndices = this._model.parts.parentIndices;
        return parentIndices;
    }
    setPartOpacityByIndex(partIndex, opacity) {
        if (this._notExistPartOpacities.has(partIndex)) {
            this._notExistPartOpacities.set(partIndex, opacity);
            return;
        }
        CSM_ASSERT(0 <= partIndex && partIndex < this.getPartCount());
        this._partOpacities[partIndex] = opacity;
    }
    setPartOpacityById(partId, opacity) {
        const index = this.getPartIndex(partId);
        if (index < 0) {
            return;
        }
        this.setPartOpacityByIndex(index, opacity);
    }
    getPartOpacityByIndex(partIndex) {
        if (this._notExistPartOpacities.has(partIndex)) {
            return this._notExistPartOpacities.get(partIndex);
        }
        CSM_ASSERT(0 <= partIndex && partIndex < this.getPartCount());
        return this._partOpacities[partIndex];
    }
    getPartOpacityById(partId) {
        const index = this.getPartIndex(partId);
        if (index < 0) {
            return 0;
        }
        return this.getPartOpacityByIndex(index);
    }
    getParameterIndex(parameterId) {
        let parameterIndex;
        const idCount = this._model.parameters.count;
        for(parameterIndex = 0; parameterIndex < idCount; ++parameterIndex){
            if (parameterId != this._parameterIds[parameterIndex]) {
                continue;
            }
            return parameterIndex;
        }
        if (this._notExistParameterId.has(parameterId)) {
            return this._notExistParameterId.get(parameterId);
        }
        parameterIndex = this._model.parameters.count + this._notExistParameterId.size;
        this._notExistParameterId.set(parameterId, parameterIndex);
        this._notExistParameterValues.set(parameterIndex, null);
        return parameterIndex;
    }
    getParameterCount() {
        return this._model.parameters.count;
    }
    getParameterType(parameterIndex) {
        return this._model.parameters.types[parameterIndex];
    }
    getParameterMaximumValue(parameterIndex) {
        return this._model.parameters.maximumValues[parameterIndex];
    }
    getParameterMinimumValue(parameterIndex) {
        return this._model.parameters.minimumValues[parameterIndex];
    }
    getParameterDefaultValue(parameterIndex) {
        return this._model.parameters.defaultValues[parameterIndex];
    }
    getParameterId(parameterIndex) {
        return CubismFramework.getIdManager().getId(this._model.parameters.ids[parameterIndex]);
    }
    getParameterValueByIndex(parameterIndex) {
        if (this._notExistParameterValues.has(parameterIndex)) {
            return this._notExistParameterValues.get(parameterIndex);
        }
        CSM_ASSERT(0 <= parameterIndex && parameterIndex < this.getParameterCount());
        return this._parameterValues[parameterIndex];
    }
    getParameterValueById(parameterId) {
        const parameterIndex = this.getParameterIndex(parameterId);
        return this.getParameterValueByIndex(parameterIndex);
    }
    setParameterValueByIndex(parameterIndex, value, weight = 1.0) {
        if (this._notExistParameterValues.has(parameterIndex)) {
            this._notExistParameterValues.set(parameterIndex, weight == 1 ? value : this._notExistParameterValues.get(parameterIndex) * (1 - weight) + value * weight);
            return;
        }
        CSM_ASSERT(0 <= parameterIndex && parameterIndex < this.getParameterCount());
        if (this.isRepeat(parameterIndex)) {
            value = this.getParameterRepeatValue(parameterIndex, value);
        } else {
            value = this.getParameterClampValue(parameterIndex, value);
        }
        this._parameterValues[parameterIndex] = weight == 1 ? value : this._parameterValues[parameterIndex] = this._parameterValues[parameterIndex] * (1 - weight) + value * weight;
    }
    setParameterValueById(parameterId, value, weight = 1.0) {
        const index = this.getParameterIndex(parameterId);
        this.setParameterValueByIndex(index, value, weight);
    }
    addParameterValueByIndex(parameterIndex, value, weight = 1.0) {
        this.setParameterValueByIndex(parameterIndex, this.getParameterValueByIndex(parameterIndex) + value * weight);
    }
    addParameterValueById(parameterId, value, weight = 1.0) {
        const index = this.getParameterIndex(parameterId);
        this.addParameterValueByIndex(index, value, weight);
    }
    isRepeat(parameterIndex) {
        if (this._notExistParameterValues.has(parameterIndex)) {
            return false;
        }
        CSM_ASSERT(0 <= parameterIndex && parameterIndex < this.getParameterCount());
        let isRepeat;
        if (this._isOverriddenParameterRepeat || this._userParameterRepeatDataList[parameterIndex].isOverridden) {
            isRepeat = this._userParameterRepeatDataList[parameterIndex].isParameterRepeated;
        } else {
            isRepeat = this._model.parameters.repeats[parameterIndex] != 0;
        }
        return isRepeat;
    }
    getParameterRepeatValue(parameterIndex, value) {
        if (this._notExistParameterValues.has(parameterIndex)) {
            return value;
        }
        CSM_ASSERT(0 <= parameterIndex && parameterIndex < this.getParameterCount());
        const maxValue = this._model.parameters.maximumValues[parameterIndex];
        const minValue = this._model.parameters.minimumValues[parameterIndex];
        const valueSize = maxValue - minValue;
        if (maxValue < value) {
            const overValue = CubismMath.mod(value - maxValue, valueSize);
            if (!Number.isNaN(overValue)) {
                value = minValue + overValue;
            } else {
                value = maxValue;
            }
        }
        if (value < minValue) {
            const overValue = CubismMath.mod(minValue - value, valueSize);
            if (!Number.isNaN(overValue)) {
                value = maxValue - overValue;
            } else {
                value = minValue;
            }
        }
        return value;
    }
    getParameterClampValue(parameterIndex, value) {
        if (this._notExistParameterValues.has(parameterIndex)) {
            return value;
        }
        CSM_ASSERT(0 <= parameterIndex && parameterIndex < this.getParameterCount());
        const maxValue = this._model.parameters.maximumValues[parameterIndex];
        const minValue = this._model.parameters.minimumValues[parameterIndex];
        return CubismMath.clamp(value, minValue, maxValue);
    }
    getParameterRepeats(parameterIndex) {
        return this._model.parameters.repeats[parameterIndex] != 0;
    }
    multiplyParameterValueById(parameterId, value, weight = 1.0) {
        const index = this.getParameterIndex(parameterId);
        this.multiplyParameterValueByIndex(index, value, weight);
    }
    multiplyParameterValueByIndex(parameterIndex, value, weight = 1.0) {
        this.setParameterValueByIndex(parameterIndex, this.getParameterValueByIndex(parameterIndex) * (1.0 + (value - 1.0) * weight));
    }
    getDrawableIndex(drawableId) {
        const drawableCount = this._model.drawables.count;
        for(let drawableIndex = 0; drawableIndex < drawableCount; ++drawableIndex){
            if (this._drawableIds[drawableIndex] == drawableId) {
                return drawableIndex;
            }
        }
        return -1;
    }
    getDrawableCount() {
        const drawableCount = this._model.drawables.count;
        return drawableCount;
    }
    getDrawableId(drawableIndex) {
        const parameterIds = this._model.drawables.ids;
        return CubismFramework.getIdManager().getId(parameterIds[drawableIndex]);
    }
    getRenderOrders() {
        const renderOrders = this._model.getRenderOrders();
        return renderOrders;
    }
    getDrawableTextureIndex(drawableIndex) {
        const textureIndices = this._model.drawables.textureIndices;
        return textureIndices[drawableIndex];
    }
    getDrawableDynamicFlagVertexPositionsDidChange(drawableIndex) {
        const dynamicFlags = this._model.drawables.dynamicFlags;
        return Live2DCubismCore.Utils.hasVertexPositionsDidChangeBit(dynamicFlags[drawableIndex]);
    }
    getDrawableVertexIndexCount(drawableIndex) {
        const indexCounts = this._model.drawables.indexCounts;
        return indexCounts[drawableIndex];
    }
    getDrawableVertexCount(drawableIndex) {
        const vertexCounts = this._model.drawables.vertexCounts;
        return vertexCounts[drawableIndex];
    }
    getDrawableVertices(drawableIndex) {
        return this.getDrawableVertexPositions(drawableIndex);
    }
    getDrawableVertexIndices(drawableIndex) {
        const indicesArray = this._model.drawables.indices;
        return indicesArray[drawableIndex];
    }
    getDrawableVertexPositions(drawableIndex) {
        const verticesArray = this._model.drawables.vertexPositions;
        return verticesArray[drawableIndex];
    }
    getDrawableVertexUvs(drawableIndex) {
        const uvsArray = this._model.drawables.vertexUvs;
        return uvsArray[drawableIndex];
    }
    getDrawableOpacity(drawableIndex) {
        const opacities = this._model.drawables.opacities;
        return opacities[drawableIndex];
    }
    getDrawableMultiplyColor(drawableIndex) {
        if (this._drawableMultiplyColors == null) {
            this._drawableMultiplyColors = new Array(this._model.drawables.count);
            this._drawableMultiplyColors.fill(new CubismTextureColor());
        }
        const multiplyColors = this._model.drawables.multiplyColors;
        const index = drawableIndex * 4;
        this._drawableMultiplyColors[drawableIndex].r = multiplyColors[index];
        this._drawableMultiplyColors[drawableIndex].g = multiplyColors[index + 1];
        this._drawableMultiplyColors[drawableIndex].b = multiplyColors[index + 2];
        this._drawableMultiplyColors[drawableIndex].a = multiplyColors[index + 3];
        return this._drawableMultiplyColors[drawableIndex];
    }
    getDrawableScreenColor(drawableIndex) {
        if (this._drawableScreenColors == null) {
            this._drawableScreenColors = new Array(this._model.drawables.count);
            this._drawableScreenColors.fill(new CubismTextureColor());
        }
        const screenColors = this._model.drawables.screenColors;
        const index = drawableIndex * 4;
        this._drawableScreenColors[drawableIndex].r = screenColors[index];
        this._drawableScreenColors[drawableIndex].g = screenColors[index + 1];
        this._drawableScreenColors[drawableIndex].b = screenColors[index + 2];
        this._drawableScreenColors[drawableIndex].a = screenColors[index + 3];
        return this._drawableScreenColors[drawableIndex];
    }
    getOffscreenMultiplyColor(offscreenIndex) {
        if (this._offscreenMultiplyColors == null) {
            this._offscreenMultiplyColors = new Array(this._model.offscreens.count);
            this._offscreenMultiplyColors.fill(new CubismTextureColor());
        }
        const multiplyColors = this._model.offscreens.multiplyColors;
        const index = offscreenIndex * 4;
        this._offscreenMultiplyColors[offscreenIndex].r = multiplyColors[index];
        this._offscreenMultiplyColors[offscreenIndex].g = multiplyColors[index + 1];
        this._offscreenMultiplyColors[offscreenIndex].b = multiplyColors[index + 2];
        this._offscreenMultiplyColors[offscreenIndex].a = multiplyColors[index + 3];
        return this._offscreenMultiplyColors[offscreenIndex];
    }
    getOffscreenScreenColor(offscreenIndex) {
        if (this._offscreenScreenColors == null) {
            this._offscreenScreenColors = new Array(this._model.offscreens.count);
            this._offscreenScreenColors.fill(new CubismTextureColor());
        }
        const screenColors = this._model.offscreens.screenColors;
        const index = offscreenIndex * 4;
        this._offscreenScreenColors[offscreenIndex].r = screenColors[index];
        this._offscreenScreenColors[offscreenIndex].g = screenColors[index + 1];
        this._offscreenScreenColors[offscreenIndex].b = screenColors[index + 2];
        this._offscreenScreenColors[offscreenIndex].a = screenColors[index + 3];
        return this._offscreenScreenColors[offscreenIndex];
    }
    getDrawableParentPartIndex(drawableIndex) {
        return this._model.drawables.parentPartIndices[drawableIndex];
    }
    getDrawableBlendMode(drawableIndex) {
        const constantFlags = this._model.drawables.constantFlags;
        return Live2DCubismCore.Utils.hasBlendAdditiveBit(constantFlags[drawableIndex]) ? CubismBlendMode.CubismBlendMode_Additive : Live2DCubismCore.Utils.hasBlendMultiplicativeBit(constantFlags[drawableIndex]) ? CubismBlendMode.CubismBlendMode_Multiplicative : CubismBlendMode.CubismBlendMode_Normal;
    }
    getDrawableColorBlend(drawableIndex) {
        if (this._drawableColorBlends[drawableIndex] == -1) {
            this._drawableColorBlends[drawableIndex] = this._model.drawables.blendModes[drawableIndex] & 0xff;
        }
        return this._drawableColorBlends[drawableIndex];
    }
    getDrawableAlphaBlend(drawableIndex) {
        if (this._drawableAlphaBlends[drawableIndex] == -1) {
            this._drawableAlphaBlends[drawableIndex] = this._model.drawables.blendModes[drawableIndex] >> 8 & 0xff;
        }
        return this._drawableAlphaBlends[drawableIndex];
    }
    getDrawableInvertedMaskBit(drawableIndex) {
        const constantFlags = this._model.drawables.constantFlags;
        return Live2DCubismCore.Utils.hasIsInvertedMaskBit(constantFlags[drawableIndex]);
    }
    getDrawableMasks() {
        const masks = this._model.drawables.masks;
        return masks;
    }
    getDrawableMaskCounts() {
        const maskCounts = this._model.drawables.maskCounts;
        return maskCounts;
    }
    isUsingMasking() {
        for(let d = 0; d < this._model.drawables.count; ++d){
            if (this._model.drawables.maskCounts[d] <= 0) {
                continue;
            }
            return true;
        }
        return false;
    }
    isUsingMaskingForOffscreen() {
        for(let d = 0; d < this.getOffscreenCount(); ++d){
            if (this._model.offscreens.maskCounts[d] <= 0) {
                continue;
            }
            return true;
        }
        return false;
    }
    getDrawableDynamicFlagIsVisible(drawableIndex) {
        const dynamicFlags = this._model.drawables.dynamicFlags;
        return Live2DCubismCore.Utils.hasIsVisibleBit(dynamicFlags[drawableIndex]);
    }
    getDrawableDynamicFlagVisibilityDidChange(drawableIndex) {
        const dynamicFlags = this._model.drawables.dynamicFlags;
        return Live2DCubismCore.Utils.hasVisibilityDidChangeBit(dynamicFlags[drawableIndex]);
    }
    getDrawableDynamicFlagOpacityDidChange(drawableIndex) {
        const dynamicFlags = this._model.drawables.dynamicFlags;
        return Live2DCubismCore.Utils.hasOpacityDidChangeBit(dynamicFlags[drawableIndex]);
    }
    getDrawableDynamicFlagRenderOrderDidChange(drawableIndex) {
        const dynamicFlags = this._model.drawables.dynamicFlags;
        return Live2DCubismCore.Utils.hasRenderOrderDidChangeBit(dynamicFlags[drawableIndex]);
    }
    getDrawableDynamicFlagBlendColorDidChange(drawableIndex) {
        const dynamicFlags = this._model.drawables.dynamicFlags;
        return Live2DCubismCore.Utils.hasBlendColorDidChangeBit(dynamicFlags[drawableIndex]);
    }
    getOffscreenCount() {
        return this._model.offscreens.count;
    }
    getOffscreenColorBlend(offscreenIndex) {
        if (this._offscreenColorBlends[offscreenIndex] == -1) {
            this._offscreenColorBlends[offscreenIndex] = this._model.offscreens.blendModes[offscreenIndex] & 0xff;
        }
        return this._offscreenColorBlends[offscreenIndex];
    }
    getOffscreenAlphaBlend(offscreenIndex) {
        if (this._offscreenAlphaBlends[offscreenIndex] == -1) {
            this._offscreenAlphaBlends[offscreenIndex] = this._model.offscreens.blendModes[offscreenIndex] >> 8 & 0xff;
        }
        return this._offscreenAlphaBlends[offscreenIndex];
    }
    getOffscreenOwnerIndices() {
        return this._model.offscreens.ownerIndices;
    }
    getOffscreenOpacity(offscreenIndex) {
        if (offscreenIndex < 0 || offscreenIndex >= this._model.offscreens.count) {
            return 1.0;
        }
        return this._model.offscreens.opacities[offscreenIndex];
    }
    getOffscreenMasks() {
        return this._model.offscreens.masks;
    }
    getOffscreenMaskCounts() {
        return this._model.offscreens.maskCounts;
    }
    getOffscreenInvertedMask(offscreenIndex) {
        const constantFlags = this._model.offscreens.constantFlags;
        return Live2DCubismCore.Utils.hasIsInvertedMaskBit(constantFlags[offscreenIndex]);
    }
    isBlendModeEnabled() {
        return this._isBlendModeEnabled;
    }
    loadParameters() {
        let parameterCount = this._model.parameters.count;
        const savedParameterCount = this._savedParameters.length;
        if (parameterCount > savedParameterCount) {
            parameterCount = savedParameterCount;
        }
        for(let i = 0; i < parameterCount; ++i){
            this._parameterValues[i] = this._savedParameters[i];
        }
    }
    initialize() {
        CSM_ASSERT(this._model);
        this._parameterValues = this._model.parameters.values;
        this._partOpacities = this._model.parts.opacities;
        this._offscreenOpacities = this._model.offscreens.opacities;
        this._parameterMaximumValues = this._model.parameters.maximumValues;
        this._parameterMinimumValues = this._model.parameters.minimumValues;
        {
            const parameterIds = this._model.parameters.ids;
            const parameterCount = this._model.parameters.count;
            this._parameterIds.length = parameterCount;
            this._userParameterRepeatDataList.length = parameterCount;
            for(let i = 0; i < parameterCount; ++i){
                this._parameterIds[i] = CubismFramework.getIdManager().getId(parameterIds[i]);
                this._userParameterRepeatDataList[i] = new ParameterRepeatData(false, false);
            }
        }
        const partCount = this._model.parts.count;
        {
            const partIds = this._model.parts.ids;
            this._partIds.length = partCount;
            for(let i = 0; i < partCount; ++i){
                this._partIds[i] = CubismFramework.getIdManager().getId(partIds[i]);
            }
        }
        {
            const drawableIds = this._model.drawables.ids;
            const drawableCount = this._model.drawables.count;
            this._userDrawableCullings.length = drawableCount;
            const userCulling = new CullingData(false, false);
            this._userOffscreenCullings.length = this._model.offscreens.count;
            const userOffscreenCulling = new CullingData(false, false);
            {
                for(let i = 0; i < drawableCount; ++i){
                    this._drawableIds.push(CubismFramework.getIdManager().getId(drawableIds[i]));
                    this._userDrawableCullings[i] = userCulling;
                }
            }
            {
                for(let i = 0; i < this._model.offscreens.count; ++i){
                    this._userOffscreenCullings[i] = userOffscreenCulling;
                }
            }
            if (this.getOffscreenCount() > 0) {
                this._isBlendModeEnabled = true;
            } else {
                const blendModes = this._model.drawables.blendModes;
                for(let i = 0; i < drawableCount; ++i){
                    const colorBlendType = this.getDrawableColorBlend(i);
                    const alphaBlendType = this.getDrawableAlphaBlend(i);
                    if (!(colorBlendType == CubismColorBlend.ColorBlend_Normal && alphaBlendType == 0) && colorBlendType != CubismColorBlend.ColorBlend_AddCompatible && colorBlendType != CubismColorBlend.ColorBlend_MultiplyCompatible) {
                        this._isBlendModeEnabled = true;
                        break;
                    }
                }
            }
            this.setupPartsHierarchy();
            const offscreenCount = this.getOffscreenCount();
            this._overrideMultiplyAndScreenColor.initialize(partCount, drawableCount, offscreenCount);
        }
    }
    getPartsHierarchy() {
        return this._partsHierarchy;
    }
    setupPartsHierarchy() {
        this._partsHierarchy.length = 0;
        const partCount = this.getPartCount();
        this._partsHierarchy.length = partCount;
        for(let i = 0; i < partCount; ++i){
            const partInfo = new CubismModelPartInfo();
            this._partsHierarchy[i] = partInfo;
        }
        for(let i = 0; i < partCount; ++i){
            const parentPartIndex = this.getPartParentPartIndices()[i];
            if (parentPartIndex === NoParentIndex) {
                continue;
            }
            for(let partIndex = 0; partIndex < this._partsHierarchy.length; ++partIndex){
                if (partIndex === parentPartIndex) {
                    const objectInfo = new CubismModelObjectInfo(i, 1);
                    this._partsHierarchy[partIndex].objects.push(objectInfo);
                    break;
                }
            }
        }
        const drawableCount = this.getDrawableCount();
        for(let i = 0; i < drawableCount; ++i){
            const parentPartIndex = this.getDrawableParentPartIndex(i);
            if (parentPartIndex === NoParentIndex) {
                continue;
            }
            for(let partIndex = 0; partIndex < this._partsHierarchy.length; ++partIndex){
                if (partIndex === parentPartIndex) {
                    const objectInfo = new CubismModelObjectInfo(i, 0);
                    this._partsHierarchy[partIndex].objects.push(objectInfo);
                    break;
                }
            }
        }
        for(let i = 0; i < this._partsHierarchy.length; ++i){
            this.getPartChildDrawObjects(i);
        }
    }
    getPartChildDrawObjects(partInfoIndex) {
        if (this._partsHierarchy[partInfoIndex].getChildObjectCount() < 1) {
            return this._partsHierarchy[partInfoIndex].childDrawObjects;
        }
        const childDrawObjects = this._partsHierarchy[partInfoIndex].childDrawObjects;
        if (childDrawObjects.drawableIndices.length !== 0 || childDrawObjects.offscreenIndices.length !== 0) {
            return childDrawObjects;
        }
        const objects = this._partsHierarchy[partInfoIndex].objects;
        for(let i = 0; i < objects.length; ++i){
            const obj = objects[i];
            if (obj.objectType === 1) {
                this.getPartChildDrawObjects(obj.objectIndex);
                const childToChildDrawObjects = this._partsHierarchy[obj.objectIndex].childDrawObjects;
                childDrawObjects.drawableIndices.push(...childToChildDrawObjects.drawableIndices);
                childDrawObjects.offscreenIndices.push(...childToChildDrawObjects.offscreenIndices);
                const offscreenIndices = this.getOffscreenIndices();
                const offscreenIndex = offscreenIndices ? offscreenIndices[obj.objectIndex] : NoOffscreenIndex;
                if (offscreenIndex !== NoOffscreenIndex) {
                    childDrawObjects.offscreenIndices.push(offscreenIndex);
                }
            } else if (obj.objectType === 0) {
                childDrawObjects.drawableIndices.push(obj.objectIndex);
            }
        }
        return childDrawObjects;
    }
    getOffscreenIndices() {
        return this._model.parts.offscreenIndices;
    }
    constructor(model){
        this._model = model;
        this._parameterValues = null;
        this._parameterMaximumValues = null;
        this._parameterMinimumValues = null;
        this._partOpacities = null;
        this._offscreenOpacities = null;
        this._savedParameters = new Array();
        this._parameterIds = new Array();
        this._drawableIds = new Array();
        this._partIds = new Array();
        this._isOverriddenParameterRepeat = true;
        this._isOverriddenCullings = false;
        this._modelOpacity = 1.0;
        this._overrideMultiplyAndScreenColor = new CubismModelMultiplyAndScreenColor(this);
        this._isBlendModeEnabled = false;
        this._drawableColorBlends = null;
        this._drawableAlphaBlends = null;
        this._offscreenColorBlends = null;
        this._offscreenAlphaBlends = null;
        this._drawableMultiplyColors = null;
        this._drawableScreenColors = null;
        this._offscreenMultiplyColors = null;
        this._offscreenScreenColors = null;
        this._userParameterRepeatDataList = new Array();
        this._userDrawableCullings = new Array();
        this._userOffscreenCullings = new Array();
        this._partsHierarchy = new Array();
        this._notExistPartId = new Map();
        this._notExistParameterId = new Map();
        this._notExistParameterValues = new Map();
        this._notExistPartOpacities = new Map();
        this._drawableColorBlends = new Array(model.drawables.count).fill(-1);
        this._drawableAlphaBlends = new Array(model.drawables.count).fill(-1);
        this._offscreenColorBlends = new Array(model.offscreens.count).fill(-1);
        this._offscreenAlphaBlends = new Array(model.offscreens.count).fill(-1);
    }
    release() {
        this._model.release();
        this._model = null;
        this._drawableColorBlends = null;
        this._drawableAlphaBlends = null;
        this._offscreenColorBlends = null;
        this._offscreenAlphaBlends = null;
        this._drawableMultiplyColors = null;
        this._drawableScreenColors = null;
        this._offscreenMultiplyColors = null;
        this._offscreenScreenColors = null;
    }
    _notExistPartOpacities;
    _notExistPartId;
    _notExistParameterValues;
    _notExistParameterId;
    _savedParameters;
    _isOverriddenParameterRepeat;
    _overrideMultiplyAndScreenColor;
    _userParameterRepeatDataList;
    _partsHierarchy;
    _model;
    _parameterValues;
    _parameterMaximumValues;
    _parameterMinimumValues;
    _partOpacities;
    _offscreenOpacities;
    _modelOpacity;
    _parameterIds;
    _partIds;
    _drawableIds;
    _isOverriddenCullings;
    _userDrawableCullings;
    _userOffscreenCullings;
    _isBlendModeEnabled;
    _drawableColorBlends;
    _drawableAlphaBlends;
    _offscreenColorBlends;
    _offscreenAlphaBlends;
    _drawableMultiplyColors;
    _drawableScreenColors;
    _offscreenMultiplyColors;
    _offscreenScreenColors;
}
import * as $ from './cubismmodel.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.CubismModel = $.CubismModel;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
