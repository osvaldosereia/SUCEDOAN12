export const CREATIVE_LIMITS=Object.freeze({minDuration:15,maxDuration:25});
export const MOTIONS=Object.freeze(['enter_left','enter_right','enter_top','rise','drop','hop','bounce','shake','wobble','spin','tilt','slide','walk','crawl','peek','fall','push','pull','chase','follow','orbit','scatter','stack','explode','celebrate','squash','stretch','zoom','reveal','exit']);
export const BEHAVIORS=Object.freeze(['curious','shy','excited','sleepy','nervous','heroic','confident','sneaky','surprised','happy','chaotic']);
const motionSet=new Set(MOTIONS),behaviorSet=new Set(BEHAVIORS);
export function normalizeCreativePlan(input={}){const plan=structuredClone(input??{});plan.duration=Number(plan.duration);plan.emotions=Array.isArray(plan.emotions)?plan.emotions.filter(Boolean):[];plan.asset_requests=Array.isArray(plan.asset_requests)?plan.asset_requests:[];plan.scenes=Array.isArray(plan.scenes)?plan.scenes:[];plan.voice_over=false;return plan}
export const isKnownMotion=v=>motionSet.has(v);export const isKnownBehavior=v=>behaviorSet.has(v);
