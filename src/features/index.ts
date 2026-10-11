/**
 * Registro das features (uma por arquivo, dono único).
 * Cada lane adiciona a sua aqui — uma linha, sem tocar em mais nada.
 */
import type { Feature } from './registry';
import { feature as sessions } from './sessions';
import { feature as context } from './context';
import { feature as plan } from './plan';
import { feature as diff } from './diff';
import { feature as editor } from './editor';
import { feature as manage } from './manage';
import { feature as diagnostics } from './diagnostics';

export const FEATURES: Feature[] = [sessions, context, plan, diff, editor, manage, diagnostics];
