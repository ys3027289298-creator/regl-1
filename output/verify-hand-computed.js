/*
  Acceptance cross-check against hand-computed values and an independent
  matrix-form reference implementation. Also verifies the shared code path
  returns bit-identical results for nested, flat and typed inputs.
 */

var assert = require('assert')
var spline = require('../lib/util/spline')

function deepEqualBitwise (a, b) {
  assert.strictEqual(a.length, b.length)
  for (var i = 0; i < a.length; ++i) {
    assert.strictEqual(a[i], b[i], 'component ' + i + ' differs')
  }
}

// Canonical Catmull-Rom basis derived independently from its 4x4 matrix.
var CR_MATRIX = [
  [-0.5, 1.5, -1.5, 0.5],
  [1.0, -2.5, 2.0, -0.5],
  [-0.5, 0.0, 0.5, 0.0],
  [0.0, 1.0, 0.0, 0.0]
]

function matrixWeights (matrix, u) {
  var uvec = [u * u * u, u * u, u, 1]
  var weights = [0, 0, 0, 0]
  for (var k = 0; k < 4; ++k) {
    for (var r = 0; r < 4; ++r) {
      weights[k] += uvec[r] * matrix[r][k]
    }
  }
  return weights
}

function referenceSample (points, segment, u, weights) {
  var window = points.slice(segment - 1, segment + 3)
  var dim = points[0].length
  var out = new Array(dim).fill(0)
  for (var k = 0; k < 4; ++k) {
    for (var j = 0; j < dim; ++j) {
      out[j] += weights[k] * window[k][j]
    }
  }
  return out
}

var points = [
  [0, 0], [2, 0], [2, 2], [0, 2], [-2, 2]
]

// Hand-computed interior Catmull-Rom point, segment 1, u = 0.25.
var u = 0.25
var crWeights = matrixWeights(CR_MATRIX, u)
var handCR = referenceSample(points, 1, u, crWeights)
var globalT = (1 + u) / (points.length - 1)
deepEqualBitwise(
  spline.catmullRom(points, globalT).map(function (v) { return v }),
  handCR
)
console.log('Catmull-Rom hand point  :', handCR, 'MATCH')

// Hand-computed uniform cubic B-spline point, segment 1, u = 0.5.
var bu = 0.5
var bWeights = [
  (1 - 3 * bu + 3 * bu * bu - bu * bu * bu) / 6,
  (4 - 6 * bu * bu + 3 * bu * bu * bu) / 6,
  (1 + 3 * bu + 3 * bu * bu - 3 * bu * bu * bu) / 6,
  (bu * bu * bu) / 6
]
var handB = referenceSample(points, 1, bu, bWeights)
var bGlobal = (1 + bu) / (points.length - 1)
deepEqualBitwise(spline.uniformCubic(points, bGlobal), handB)
console.log('B-spline hand point     :', handB, 'MATCH')

// End points must be reproduced exactly.
deepEqualBitwise(spline.catmullRom(points, 0), points[0])
deepEqualBitwise(spline.catmullRom(points, 1), points[points.length - 1])
deepEqualBitwise(
  spline.uniformCubic(points, 0, { edge: 'mirror' }), points[0])
deepEqualBitwise(
  spline.uniformCubic(points, 1, { edge: 'mirror' }), points[points.length - 1])
console.log('End point interpolation : exact MATCH')

// Nested, flat Array and typed array must share one implementation and
// produce bit-identical arithmetic.
var nested = [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12]]
var flat = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
var typed = new Float64Array(flat)
var tSample = 0.37
deepEqualBitwise(
  spline.catmullRom(nested, tSample),
  spline.catmullRom(flat, tSample, { dimension: 3 }))
deepEqualBitwise(
  spline.catmullRom(flat, tSample, { dimension: 3 }),
  spline.catmullRom(typed, tSample, { dimension: 3 }))
console.log('Shared vector path      : nested/flat/typed bit-identical MATCH')

// Invalid inputs must be rejected.
function rejects (fn, label) {
  assert.throws(fn, Error)
  console.log('Rejected                : ' + label)
}
rejects(function () { spline.catmullRom([], 0.5) }, 'empty point column')
rejects(function () { spline.catmullRom([[1]], 0.5) }, 'single point')
rejects(function () { spline.catmullRom([[1, NaN], [2, 3]], 0.5) }, 'NaN component')
rejects(function () { spline.catmullRom([[1], [2]], NaN) }, 'NaN t')
rejects(function () {
  spline.catmullRom([[1], [2]], 0.5, { edge: 'bogus' })
}, 'unknown endpoint strategy')

console.log('\nALL HAND-COMPUTED ACCEPTANCE CHECKS PASSED')
