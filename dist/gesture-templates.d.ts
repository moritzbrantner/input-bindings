import type { GestureMatch } from "@moritzbrantner/input-bindings";
import { type StrokeTrace } from "./gesture-features.js";
type Point = {
    x: number;
    y: number;
};
/**
 * `fixed`: the stroke must be drawn at the template's orientation.
 * `invariant`: any rotation is accepted; the best-fitting rotation is reported as evidence.
 */
export type TemplateRotationPolicy = "fixed" | "invariant";
/**
 * `directed`: the stroke must be drawn in the template's order.
 * `either`: drawing it backwards is accepted too; reversal is reported as evidence.
 */
export type TemplateDirectionPolicy = "directed" | "either";
/** A named single-stroke symbol. Application actions do not belong in a template. */
export type GestureTemplate = {
    /** Stable id, bound through `{ kind: "symbol", id }`. */
    id: string;
    /** Authored points in any coordinate scale; normalized when compiled. */
    points: readonly Point[];
    rotation: TemplateRotationPolicy;
    direction: TemplateDirectionPolicy;
    /** Largest accepted mean distance between normalized point sequences (unit: longest side). */
    maxDistance: number;
    provenance: {
        source: string;
        version: string;
    };
};
export type CompiledGestureTemplate = Omit<GestureTemplate, "points"> & {
    /** Resampled, centroid-translated, uniformly scaled points (and rotation-normalized if invariant). */
    normalized: readonly Point[];
    /** Radians from the centroid to the first point before rotation normalization. */
    indicativeAngle: number;
};
export type GestureSymbolCandidate = {
    id: string;
    /** Mean distance between normalized point sequences; lower is closer. */
    distance: number;
    /** 1 - distance / maxDistance, clamped to [0, 1]; 0 at the acceptance boundary or beyond. */
    score: number;
    accepted: boolean;
    /**
     * Degrees that rotate the stroke onto an invariant template, in (-180, 180]; positive is
     * clockwise on screen. Always 0 for fixed templates.
     */
    rotation: number;
    /** True when the reversed stroke fitted an `either`-direction template better. */
    reversed: boolean;
    provenance: GestureTemplate["provenance"];
};
export type GestureSymbolRecognition = {
    /** Every template, closest first; ties are ordered by template id, never registration order. */
    candidates: GestureSymbolCandidate[];
    /** Why recognition did not compare the stroke, when it did not. */
    skipped?: "tooSmall" | "tooFewSamples";
};
export type GestureSymbolOptions = {
    /** Strokes whose bounds diagonal is smaller than this are not compared. Defaults to 20 px. */
    minDiagonalPx?: number | undefined;
};
export declare const TEMPLATE_RESAMPLE_COUNT = 64;
/** Validates and normalizes templates once so recognition only compares prepared sequences. */
export declare function compileGestureTemplates(templates: readonly GestureTemplate[]): CompiledGestureTemplate[];
/** Compares one stroke against every template and ranks the results deterministically. */
export declare function recognizeGestureSymbols(trace: StrokeTrace, templates: readonly CompiledGestureTemplate[], options?: GestureSymbolOptions): GestureSymbolRecognition;
/** Accepted symbols as gesture matches, closest first. */
export declare function gestureMatchesFromSymbols(recognition: GestureSymbolRecognition): GestureMatch[];
export {};
