import { CubismTextureColor } from '../rendering/cubismrenderer.js';
import { CubismModelObjectType, NoOffscreenIndex } from './cubismmodel.js';
import { CubismLogWarning } from '../utils/cubismdebug.js';
export class ColorData {
    constructor(isOverridden = false, color = new CubismTextureColor()){
        this.isOverridden = isOverridden;
        this.color = color;
    }
    isOverridden;
    color;
}
export class CubismModelMultiplyAndScreenColor {
    _model;
    _isOverriddenModelMultiplyColors;
    _isOverriddenModelScreenColors;
    _userPartScreenColors;
    _userPartMultiplyColors;
    _userDrawableScreenColors;
    _userDrawableMultiplyColors;
    _userOffscreenScreenColors;
    _userOffscreenMultiplyColors;
    constructor(model){
        this._model = model;
        this._isOverriddenModelMultiplyColors = false;
        this._isOverriddenModelScreenColors = false;
        this._userPartScreenColors = [];
        this._userPartMultiplyColors = [];
        this._userDrawableScreenColors = [];
        this._userDrawableMultiplyColors = [];
        this._userOffscreenScreenColors = [];
        this._userOffscreenMultiplyColors = [];
    }
    initialize(partCount, drawableCount, offscreenCount) {
        const userMultiplyColor = new ColorData(false, new CubismTextureColor(1.0, 1.0, 1.0, 1.0));
        const userScreenColor = new ColorData(false, new CubismTextureColor(0.0, 0.0, 0.0, 1.0));
        this._userPartMultiplyColors = new Array(partCount);
        this._userPartScreenColors = new Array(partCount);
        for(let i = 0; i < partCount; i++){
            this._userPartMultiplyColors[i] = new ColorData(userMultiplyColor.isOverridden, new CubismTextureColor(userMultiplyColor.color.r, userMultiplyColor.color.g, userMultiplyColor.color.b, userMultiplyColor.color.a));
            this._userPartScreenColors[i] = new ColorData(userScreenColor.isOverridden, new CubismTextureColor(userScreenColor.color.r, userScreenColor.color.g, userScreenColor.color.b, userScreenColor.color.a));
        }
        this._userDrawableMultiplyColors = new Array(drawableCount);
        this._userDrawableScreenColors = new Array(drawableCount);
        for(let i = 0; i < drawableCount; i++){
            this._userDrawableMultiplyColors[i] = new ColorData(userMultiplyColor.isOverridden, new CubismTextureColor(userMultiplyColor.color.r, userMultiplyColor.color.g, userMultiplyColor.color.b, userMultiplyColor.color.a));
            this._userDrawableScreenColors[i] = new ColorData(userScreenColor.isOverridden, new CubismTextureColor(userScreenColor.color.r, userScreenColor.color.g, userScreenColor.color.b, userScreenColor.color.a));
        }
        this._userOffscreenMultiplyColors = new Array(offscreenCount);
        this._userOffscreenScreenColors = new Array(offscreenCount);
        for(let i = 0; i < offscreenCount; i++){
            this._userOffscreenMultiplyColors[i] = new ColorData(userMultiplyColor.isOverridden, new CubismTextureColor(userMultiplyColor.color.r, userMultiplyColor.color.g, userMultiplyColor.color.b, userMultiplyColor.color.a));
            this._userOffscreenScreenColors[i] = new ColorData(userScreenColor.isOverridden, new CubismTextureColor(userScreenColor.color.r, userScreenColor.color.g, userScreenColor.color.b, userScreenColor.color.a));
        }
    }
    warnIndexOutOfRange(functionName, index, maxIndex) {
        CubismLogWarning(`${functionName}: index is out of range. index=${index}, valid range=[0, ${maxIndex}].`);
    }
    isValidPartIndex(index, functionName) {
        if (index < 0 || index >= this._model.getPartCount()) {
            this.warnIndexOutOfRange(functionName, index, this._model.getPartCount() - 1);
            return false;
        }
        return true;
    }
    isValidDrawableIndex(index, functionName) {
        if (index < 0 || index >= this._model.getDrawableCount()) {
            this.warnIndexOutOfRange(functionName, index, this._model.getDrawableCount() - 1);
            return false;
        }
        return true;
    }
    isValidOffscreenIndex(index, functionName) {
        if (index < 0 || index >= this._model.getOffscreenCount()) {
            this.warnIndexOutOfRange(functionName, index, this._model.getOffscreenCount() - 1);
            return false;
        }
        return true;
    }
    setMultiplyColorEnabled(value) {
        this._isOverriddenModelMultiplyColors = value;
    }
    getMultiplyColorEnabled() {
        return this._isOverriddenModelMultiplyColors;
    }
    setScreenColorEnabled(value) {
        this._isOverriddenModelScreenColors = value;
    }
    getScreenColorEnabled() {
        return this._isOverriddenModelScreenColors;
    }
    setPartMultiplyColorEnabled(partIndex, value) {
        if (!this.isValidPartIndex(partIndex, 'setPartMultiplyColorEnabled')) {
            return;
        }
        this.setPartColorEnabled(partIndex, value, this._userPartMultiplyColors, this._userDrawableMultiplyColors, this._userOffscreenMultiplyColors);
    }
    getPartMultiplyColorEnabled(partIndex) {
        if (!this.isValidPartIndex(partIndex, 'getPartMultiplyColorEnabled')) {
            return false;
        }
        return this._userPartMultiplyColors[partIndex].isOverridden;
    }
    setPartScreenColorEnabled(partIndex, value) {
        if (!this.isValidPartIndex(partIndex, 'setPartScreenColorEnabled')) {
            return;
        }
        this.setPartColorEnabled(partIndex, value, this._userPartScreenColors, this._userDrawableScreenColors, this._userOffscreenScreenColors);
    }
    getPartScreenColorEnabled(partIndex) {
        if (!this.isValidPartIndex(partIndex, 'getPartScreenColorEnabled')) {
            return false;
        }
        return this._userPartScreenColors[partIndex].isOverridden;
    }
    setPartMultiplyColorByTextureColor(partIndex, color) {
        if (!this.isValidPartIndex(partIndex, 'setPartMultiplyColorByTextureColor')) {
            return;
        }
        this.setPartMultiplyColorByRGBA(partIndex, color.r, color.g, color.b, color.a);
    }
    setPartMultiplyColorByRGBA(partIndex, r, g, b, a = 1.0) {
        if (!this.isValidPartIndex(partIndex, 'setPartMultiplyColorByRGBA')) {
            return;
        }
        this.setPartColor(partIndex, r, g, b, a, this._userPartMultiplyColors, this._userDrawableMultiplyColors, this._userOffscreenMultiplyColors);
    }
    getPartMultiplyColor(partIndex) {
        if (!this.isValidPartIndex(partIndex, 'getPartMultiplyColor')) {
            return new CubismTextureColor(1.0, 1.0, 1.0, 1.0);
        }
        return this._userPartMultiplyColors[partIndex].color;
    }
    setPartScreenColorByTextureColor(partIndex, color) {
        if (!this.isValidPartIndex(partIndex, 'setPartScreenColorByTextureColor')) {
            return;
        }
        this.setPartScreenColorByRGBA(partIndex, color.r, color.g, color.b, color.a);
    }
    setPartScreenColorByRGBA(partIndex, r, g, b, a = 1.0) {
        if (!this.isValidPartIndex(partIndex, 'setPartScreenColorByRGBA')) {
            return;
        }
        this.setPartColor(partIndex, r, g, b, a, this._userPartScreenColors, this._userDrawableScreenColors, this._userOffscreenScreenColors);
    }
    getPartScreenColor(partIndex) {
        if (!this.isValidPartIndex(partIndex, 'getPartScreenColor')) {
            return new CubismTextureColor(0.0, 0.0, 0.0, 1.0);
        }
        return this._userPartScreenColors[partIndex].color;
    }
    setDrawableMultiplyColorEnabled(drawableIndex, value) {
        if (!this.isValidDrawableIndex(drawableIndex, 'setDrawableMultiplyColorEnabled')) {
            return;
        }
        this._userDrawableMultiplyColors[drawableIndex].isOverridden = value;
    }
    getDrawableMultiplyColorEnabled(drawableIndex) {
        if (!this.isValidDrawableIndex(drawableIndex, 'getDrawableMultiplyColorEnabled')) {
            return false;
        }
        return this._userDrawableMultiplyColors[drawableIndex].isOverridden;
    }
    setDrawableScreenColorEnabled(drawableIndex, value) {
        if (!this.isValidDrawableIndex(drawableIndex, 'setDrawableScreenColorEnabled')) {
            return;
        }
        this._userDrawableScreenColors[drawableIndex].isOverridden = value;
    }
    getDrawableScreenColorEnabled(drawableIndex) {
        if (!this.isValidDrawableIndex(drawableIndex, 'getDrawableScreenColorEnabled')) {
            return false;
        }
        return this._userDrawableScreenColors[drawableIndex].isOverridden;
    }
    setDrawableMultiplyColorByTextureColor(drawableIndex, color) {
        if (!this.isValidDrawableIndex(drawableIndex, 'setDrawableMultiplyColorByTextureColor')) {
            return;
        }
        this.setDrawableMultiplyColorByRGBA(drawableIndex, color.r, color.g, color.b, color.a);
    }
    setDrawableMultiplyColorByRGBA(drawableIndex, r, g, b, a = 1.0) {
        if (!this.isValidDrawableIndex(drawableIndex, 'setDrawableMultiplyColorByRGBA')) {
            return;
        }
        this._userDrawableMultiplyColors[drawableIndex].color.r = r;
        this._userDrawableMultiplyColors[drawableIndex].color.g = g;
        this._userDrawableMultiplyColors[drawableIndex].color.b = b;
        this._userDrawableMultiplyColors[drawableIndex].color.a = a;
    }
    getDrawableMultiplyColor(drawableIndex) {
        if (!this.isValidDrawableIndex(drawableIndex, 'getDrawableMultiplyColor')) {
            return new CubismTextureColor(1.0, 1.0, 1.0, 1.0);
        }
        if (this.getMultiplyColorEnabled() || this.getDrawableMultiplyColorEnabled(drawableIndex)) {
            return this._userDrawableMultiplyColors[drawableIndex].color;
        }
        return this._model.getDrawableMultiplyColor(drawableIndex);
    }
    setDrawableScreenColorByTextureColor(drawableIndex, color) {
        if (!this.isValidDrawableIndex(drawableIndex, 'setDrawableScreenColorByTextureColor')) {
            return;
        }
        this.setDrawableScreenColorByRGBA(drawableIndex, color.r, color.g, color.b, color.a);
    }
    setDrawableScreenColorByRGBA(drawableIndex, r, g, b, a = 1.0) {
        if (!this.isValidDrawableIndex(drawableIndex, 'setDrawableScreenColorByRGBA')) {
            return;
        }
        this._userDrawableScreenColors[drawableIndex].color.r = r;
        this._userDrawableScreenColors[drawableIndex].color.g = g;
        this._userDrawableScreenColors[drawableIndex].color.b = b;
        this._userDrawableScreenColors[drawableIndex].color.a = a;
    }
    getDrawableScreenColor(drawableIndex) {
        if (!this.isValidDrawableIndex(drawableIndex, 'getDrawableScreenColor')) {
            return new CubismTextureColor(0.0, 0.0, 0.0, 1.0);
        }
        if (this.getScreenColorEnabled() || this.getDrawableScreenColorEnabled(drawableIndex)) {
            return this._userDrawableScreenColors[drawableIndex].color;
        }
        return this._model.getDrawableScreenColor(drawableIndex);
    }
    setOffscreenMultiplyColorEnabled(offscreenIndex, value) {
        if (!this.isValidOffscreenIndex(offscreenIndex, 'setOffscreenMultiplyColorEnabled')) {
            return;
        }
        this._userOffscreenMultiplyColors[offscreenIndex].isOverridden = value;
    }
    getOffscreenMultiplyColorEnabled(offscreenIndex) {
        if (!this.isValidOffscreenIndex(offscreenIndex, 'getOffscreenMultiplyColorEnabled')) {
            return false;
        }
        return this._userOffscreenMultiplyColors[offscreenIndex].isOverridden;
    }
    setOffscreenScreenColorEnabled(offscreenIndex, value) {
        if (!this.isValidOffscreenIndex(offscreenIndex, 'setOffscreenScreenColorEnabled')) {
            return;
        }
        this._userOffscreenScreenColors[offscreenIndex].isOverridden = value;
    }
    getOffscreenScreenColorEnabled(offscreenIndex) {
        if (!this.isValidOffscreenIndex(offscreenIndex, 'getOffscreenScreenColorEnabled')) {
            return false;
        }
        return this._userOffscreenScreenColors[offscreenIndex].isOverridden;
    }
    setOffscreenMultiplyColorByTextureColor(offscreenIndex, color) {
        if (!this.isValidOffscreenIndex(offscreenIndex, 'setOffscreenMultiplyColorByTextureColor')) {
            return;
        }
        this.setOffscreenMultiplyColorByRGBA(offscreenIndex, color.r, color.g, color.b, color.a);
    }
    setOffscreenMultiplyColorByRGBA(offscreenIndex, r, g, b, a = 1.0) {
        if (!this.isValidOffscreenIndex(offscreenIndex, 'setOffscreenMultiplyColorByRGBA')) {
            return;
        }
        this._userOffscreenMultiplyColors[offscreenIndex].color.r = r;
        this._userOffscreenMultiplyColors[offscreenIndex].color.g = g;
        this._userOffscreenMultiplyColors[offscreenIndex].color.b = b;
        this._userOffscreenMultiplyColors[offscreenIndex].color.a = a;
    }
    getOffscreenMultiplyColor(offscreenIndex) {
        if (!this.isValidOffscreenIndex(offscreenIndex, 'getOffscreenMultiplyColor')) {
            return new CubismTextureColor(1.0, 1.0, 1.0, 1.0);
        }
        if (this.getMultiplyColorEnabled() || this.getOffscreenMultiplyColorEnabled(offscreenIndex)) {
            return this._userOffscreenMultiplyColors[offscreenIndex].color;
        }
        return this._model.getOffscreenMultiplyColor(offscreenIndex);
    }
    setOffscreenScreenColorByTextureColor(offscreenIndex, color) {
        if (!this.isValidOffscreenIndex(offscreenIndex, 'setOffscreenScreenColorByTextureColor')) {
            return;
        }
        this.setOffscreenScreenColorByRGBA(offscreenIndex, color.r, color.g, color.b, color.a);
    }
    setOffscreenScreenColorByRGBA(offscreenIndex, r, g, b, a = 1.0) {
        if (!this.isValidOffscreenIndex(offscreenIndex, 'setOffscreenScreenColorByRGBA')) {
            return;
        }
        this._userOffscreenScreenColors[offscreenIndex].color.r = r;
        this._userOffscreenScreenColors[offscreenIndex].color.g = g;
        this._userOffscreenScreenColors[offscreenIndex].color.b = b;
        this._userOffscreenScreenColors[offscreenIndex].color.a = a;
    }
    getOffscreenScreenColor(offscreenIndex) {
        if (!this.isValidOffscreenIndex(offscreenIndex, 'getOffscreenScreenColor')) {
            return new CubismTextureColor(0.0, 0.0, 0.0, 1.0);
        }
        if (this.getScreenColorEnabled() || this.getOffscreenScreenColorEnabled(offscreenIndex)) {
            return this._userOffscreenScreenColors[offscreenIndex].color;
        }
        return this._model.getOffscreenScreenColor(offscreenIndex);
    }
    setPartColor(partIndex, r, g, b, a, partColors, drawableColors, offscreenColors) {
        partColors[partIndex].color.r = r;
        partColors[partIndex].color.g = g;
        partColors[partIndex].color.b = b;
        partColors[partIndex].color.a = a;
        if (partColors[partIndex].isOverridden) {
            const offscreenIndices = this._model.getPartOffscreenIndices();
            const offscreenIndex = offscreenIndices[partIndex];
            if (offscreenIndex == NoOffscreenIndex) {
                const partsHierarchy = this._model.getPartsHierarchy();
                if (partsHierarchy && partsHierarchy[partIndex]) {
                    for(let i = 0; i < partsHierarchy[partIndex].objects.length; ++i){
                        const objectInfo = partsHierarchy[partIndex].objects[i];
                        if (objectInfo.objectType === CubismModelObjectType.CubismModelObjectType_Drawable) {
                            const drawableIndex = objectInfo.objectIndex;
                            drawableColors[drawableIndex].color.r = r;
                            drawableColors[drawableIndex].color.g = g;
                            drawableColors[drawableIndex].color.b = b;
                            drawableColors[drawableIndex].color.a = a;
                        } else {
                            const childPartIndex = objectInfo.objectIndex;
                            this.setPartColor(childPartIndex, r, g, b, a, partColors, drawableColors, offscreenColors);
                        }
                    }
                }
            } else {
                offscreenColors[offscreenIndex].color.r = r;
                offscreenColors[offscreenIndex].color.g = g;
                offscreenColors[offscreenIndex].color.b = b;
                offscreenColors[offscreenIndex].color.a = a;
            }
        }
    }
    setPartColorEnabled(partIndex, value, partColors, drawableColors, offscreenColors) {
        partColors[partIndex].isOverridden = value;
        const offscreenIndices = this._model.getPartOffscreenIndices();
        const offscreenIndex = offscreenIndices[partIndex];
        if (offscreenIndex == NoOffscreenIndex) {
            const partsHierarchy = this._model.getPartsHierarchy();
            if (partsHierarchy && partsHierarchy[partIndex]) {
                for(let i = 0; i < partsHierarchy[partIndex].objects.length; ++i){
                    const objectInfo = partsHierarchy[partIndex].objects[i];
                    if (objectInfo.objectType === CubismModelObjectType.CubismModelObjectType_Drawable) {
                        const drawableIndex = objectInfo.objectIndex;
                        drawableColors[drawableIndex].isOverridden = value;
                        if (value) {
                            drawableColors[drawableIndex].color.r = partColors[partIndex].color.r;
                            drawableColors[drawableIndex].color.g = partColors[partIndex].color.g;
                            drawableColors[drawableIndex].color.b = partColors[partIndex].color.b;
                            drawableColors[drawableIndex].color.a = partColors[partIndex].color.a;
                        }
                    } else {
                        const childPartIndex = objectInfo.objectIndex;
                        if (value) {
                            partColors[childPartIndex].color.r = partColors[partIndex].color.r;
                            partColors[childPartIndex].color.g = partColors[partIndex].color.g;
                            partColors[childPartIndex].color.b = partColors[partIndex].color.b;
                            partColors[childPartIndex].color.a = partColors[partIndex].color.a;
                        }
                        this.setPartColorEnabled(childPartIndex, value, partColors, drawableColors, offscreenColors);
                    }
                }
            }
        } else {
            offscreenColors[offscreenIndex].isOverridden = value;
            if (value) {
                offscreenColors[offscreenIndex].color.r = partColors[partIndex].color.r;
                offscreenColors[offscreenIndex].color.g = partColors[partIndex].color.g;
                offscreenColors[offscreenIndex].color.b = partColors[partIndex].color.b;
                offscreenColors[offscreenIndex].color.a = partColors[partIndex].color.a;
            }
        }
    }
}
