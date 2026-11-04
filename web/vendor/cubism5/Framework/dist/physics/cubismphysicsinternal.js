import { CubismIdHandle } from '../id/cubismid.js';
import { CubismVector2 } from '../math/cubismvector2.js';
export var CubismPhysicsTargetType = /*#__PURE__*/ function(CubismPhysicsTargetType) {
    CubismPhysicsTargetType[CubismPhysicsTargetType["CubismPhysicsTargetType_Parameter"] = 0] = "CubismPhysicsTargetType_Parameter";
    return CubismPhysicsTargetType;
}({});
export var CubismPhysicsSource = /*#__PURE__*/ function(CubismPhysicsSource) {
    CubismPhysicsSource[CubismPhysicsSource["CubismPhysicsSource_X"] = 0] = "CubismPhysicsSource_X";
    CubismPhysicsSource[CubismPhysicsSource["CubismPhysicsSource_Y"] = 1] = "CubismPhysicsSource_Y";
    CubismPhysicsSource[CubismPhysicsSource["CubismPhysicsSource_Angle"] = 2] = "CubismPhysicsSource_Angle";
    return CubismPhysicsSource;
}({});
export class PhysicsJsonEffectiveForces {
    constructor(){
        this.gravity = new CubismVector2(0, 0);
        this.wind = new CubismVector2(0, 0);
    }
    gravity;
    wind;
}
export class CubismPhysicsParameter {
    id;
    targetType;
}
export class CubismPhysicsNormalization {
    minimum;
    maximum;
    defalut;
}
export class CubismPhysicsParticle {
    constructor(){
        this.initialPosition = new CubismVector2(0, 0);
        this.position = new CubismVector2(0, 0);
        this.lastPosition = new CubismVector2(0, 0);
        this.lastGravity = new CubismVector2(0, 0);
        this.force = new CubismVector2(0, 0);
        this.velocity = new CubismVector2(0, 0);
    }
    initialPosition;
    mobility;
    delay;
    acceleration;
    radius;
    position;
    lastPosition;
    lastGravity;
    force;
    velocity;
}
export class CubismPhysicsSubRig {
    constructor(){
        this.normalizationPosition = new CubismPhysicsNormalization();
        this.normalizationAngle = new CubismPhysicsNormalization();
    }
    inputCount;
    outputCount;
    particleCount;
    baseInputIndex;
    baseOutputIndex;
    baseParticleIndex;
    normalizationPosition;
    normalizationAngle;
}
export class CubismPhysicsInput {
    constructor(){
        this.source = new CubismPhysicsParameter();
    }
    source;
    sourceParameterIndex;
    weight;
    type;
    reflect;
    getNormalizedParameterValue;
}
export class CubismPhysicsOutput {
    constructor(){
        this.destination = new CubismPhysicsParameter();
        this.translationScale = new CubismVector2(0, 0);
    }
    destination;
    destinationParameterIndex;
    vertexIndex;
    translationScale;
    angleScale;
    weight;
    type;
    reflect;
    valueBelowMinimum;
    valueExceededMaximum;
    getValue;
    getScale;
}
export class CubismPhysicsRig {
    constructor(){
        this.settings = new Array();
        this.inputs = new Array();
        this.outputs = new Array();
        this.particles = new Array();
        this.gravity = new CubismVector2(0, 0);
        this.wind = new CubismVector2(0, 0);
        this.fps = 0.0;
    }
    subRigCount;
    settings;
    inputs;
    outputs;
    particles;
    gravity;
    wind;
    fps;
}
import * as $ from './cubismphysicsinternal.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.CubismPhysicsInput = $.CubismPhysicsInput;
    Live2DCubismFramework.CubismPhysicsNormalization = $.CubismPhysicsNormalization;
    Live2DCubismFramework.CubismPhysicsOutput = $.CubismPhysicsOutput;
    Live2DCubismFramework.CubismPhysicsParameter = $.CubismPhysicsParameter;
    Live2DCubismFramework.CubismPhysicsParticle = $.CubismPhysicsParticle;
    Live2DCubismFramework.CubismPhysicsRig = $.CubismPhysicsRig;
    Live2DCubismFramework.CubismPhysicsSource = $.CubismPhysicsSource;
    Live2DCubismFramework.CubismPhysicsSubRig = $.CubismPhysicsSubRig;
    Live2DCubismFramework.CubismPhysicsTargetType = $.CubismPhysicsTargetType;
    Live2DCubismFramework.PhysicsJsonEffectiveForces = $.PhysicsJsonEffectiveForces;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
