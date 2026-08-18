import assert from 'node:assert/strict';
import {sanitizeUserMessage} from '../web/app-copy-policy.js';
assert.equal(sanitizeUserMessage('request_timeout'),'La operación tardó demasiado. Intenta nuevamente.');
assert.equal(sanitizeUserMessage('HTTP 500'),'No se pudo completar la operación. Intenta nuevamente.');
assert.doesNotMatch(sanitizeUserMessage('Nuvasto cerró netLineTotal con invoice-column-matrix-reconciled'),/netLineTotal|invoice-column/i);
console.log('v83 copy policy messages: OK');
