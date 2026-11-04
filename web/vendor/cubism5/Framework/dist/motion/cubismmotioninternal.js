import { CubismIdHandle } from '../id/cubismid.js';
export var CubismMotionCurveTarget = /*#__PURE__*/ function(CubismMotionCurveTarget) {
    CubismMotionCurveTarget[CubismMotionCurveTarget["CubismMotionCurveTarget_Model"] = 0] = "CubismMotionCurveTarget_Model";
    CubismMotionCurveTarget[CubismMotionCurveTarget["CubismMotionCurveTarget_Parameter"] = 1] = "CubismMotionCurveTarget_Parameter";
    CubismMotionCurveTarget[CubismMotionCurveTarget["CubismMotionCurveTarget_PartOpacity"] = 2] = "CubismMotionCurveTarget_PartOpacity";
    return CubismMotionCurveTarget;
}({});
export var CubismMotionSegmentType = /*#__PURE__*/ function(CubismMotionSegmentType) {
    CubismMotionSegmentType[CubismMotionSegmentType["CubismMotionSegmentType_Linear"] = 0] = "CubismMotionSegmentType_Linear";
    CubismMotionSegmentType[CubismMotionSegmentType["CubismMotionSegmentType_Bezier"] = 1] = "CubismMotionSegmentType_Bezier";
    CubismMotionSegmentType[CubismMotionSegmentType["CubismMotionSegmentType_Stepped"] = 2] = "CubismMotionSegmentType_Stepped";
    CubismMotionSegmentType[CubismMotionSegmentType["CubismMotionSegmentType_InverseStepped"] = 3] = "CubismMotionSegmentType_InverseStepped";
    return CubismMotionSegmentType;
}({});
export class CubismMotionPoint {
    time = 0.0;
    value = 0.0;
}
export class CubismMotionSegment {
    constructor(){
        this.evaluate = null;
        this.basePointIndex = 0;
        this.segmentType = 0;
    }
    evaluate;
    basePointIndex;
    segmentType;
}
export class CubismMotionCurve {
    constructor(){
        this.type = 0;
        this.segmentCount = 0;
        this.baseSegmentIndex = 0;
        this.fadeInTime = 0.0;
        this.fadeOutTime = 0.0;
    }
    type;
    id;
    segmentCount;
    baseSegmentIndex;
    fadeInTime;
    fadeOutTime;
}
export class CubismMotionEvent {
    fireTime = 0.0;
    value;
}
export class CubismMotionData {
    constructor(){
        this.duration = 0.0;
        this.loop = false;
        this.curveCount = 0;
        this.eventCount = 0;
        this.fps = 0.0;
        this.curves = new Array();
        this.segments = new Array();
        this.points = new Array();
        this.events = new Array();
    }
    duration;
    loop;
    curveCount;
    eventCount;
    fps;
    curves;
    segments;
    points;
    events;
}
import * as $ from './cubismmotioninternal.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.CubismMotionCurve = $.CubismMotionCurve;
    Live2DCubismFramework.CubismMotionCurveTarget = $.CubismMotionCurveTarget;
    Live2DCubismFramework.CubismMotionData = $.CubismMotionData;
    Live2DCubismFramework.CubismMotionEvent = $.CubismMotionEvent;
    Live2DCubismFramework.CubismMotionPoint = $.CubismMotionPoint;
    Live2DCubismFramework.CubismMotionSegment = $.CubismMotionSegment;
    Live2DCubismFramework.CubismMotionSegmentType = $.CubismMotionSegmentType;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
