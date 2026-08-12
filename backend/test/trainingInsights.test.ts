import { strict as assert } from 'node:assert'
import test from 'node:test'
import { buildTrainingInsights } from '../src/utils/trainingInsights.js'

const referenceDate = new Date('2024-01-29T12:00:00.000Z')

test('returns zeroed insights for empty history', () => {
  const result = buildTrainingInsights([], referenceDate)

  assert.equal(result.totalSessions, 0)
  assert.equal(result.currentStreakDays, 0)
  assert.equal(result.daysSinceLastSession, 0)
  assert.equal(result.volumeLast7DaysKg, 0)
  assert.equal(result.volumePrevious7DaysKg, 0)
  assert.equal(result.predictedNextWeekVolumeKg, 0)
  assert.equal(result.predictedNextSessionVolumeKg, 0)
  assert.equal(result.confidence, 'low')
  assert.equal(result.momentum, 'stable')
})

test('counts one day of training as a one-day streak', () => {
  const result = buildTrainingInsights([
    { date: '2024-01-29T08:00:00.000Z', total_volume: '200', exercise_name: 'Press banca' },
  ], referenceDate)

  assert.equal(result.totalSessions, 1)
  assert.equal(result.currentStreakDays, 1)
  assert.equal(result.daysSinceLastSession, 0)
  assert.equal(result.volumeLast7DaysKg, 200)
  assert.equal(result.predictedNextWeekVolumeKg, 200)
  assert.equal(result.predictedNextSessionVolumeKg, 200)
})

test('collapses multiple sessions on the same day into a single streak day', () => {
  const result = buildTrainingInsights([
    { date: '2024-01-28T08:00:00.000Z', total_volume: '120', exercise_name: 'Remo' },
    { date: '2024-01-28T18:00:00.000Z', total_volume: '80', exercise_name: 'Press militar' },
  ], referenceDate)

  assert.equal(result.totalSessions, 2)
  assert.equal(result.currentStreakDays, 1)
  assert.equal(result.volumeLast7DaysKg, 200)
})

test('detects a three-day streak', () => {
  const result = buildTrainingInsights([
    { date: '2024-01-27T08:00:00.000Z', total_volume: '100', exercise_name: 'Sentadilla' },
    { date: '2024-01-28T08:00:00.000Z', total_volume: '150', exercise_name: 'Remo' },
    { date: '2024-01-29T08:00:00.000Z', total_volume: '170', exercise_name: 'Press banca' },
  ], referenceDate)

  assert.equal(result.currentStreakDays, 3)
  assert.equal(result.daysSinceLastSession, 0)
})

test('reports upward trend when the last week outperforms the previous one', () => {
  const result = buildTrainingInsights([
    { date: '2024-01-16T08:00:00.000Z', total_volume: '100', exercise_name: 'Curl' },
    { date: '2024-01-18T08:00:00.000Z', total_volume: '100', exercise_name: 'Curl' },
    { date: '2024-01-23T08:00:00.000Z', total_volume: '300', exercise_name: 'Press banca' },
    { date: '2024-01-25T08:00:00.000Z', total_volume: '400', exercise_name: 'Press banca' },
  ], referenceDate)

  assert.equal(result.volumePrevious7DaysKg, 200)
  assert.equal(result.volumeLast7DaysKg, 700)
  assert.equal(result.momentum, 'up')
  assert.ok(result.weeklyTrendPercent > 0)
})

test('reports downward momentum when the last week drops sharply', () => {
  const result = buildTrainingInsights([
    { date: '2024-01-16T08:00:00.000Z', total_volume: '500', exercise_name: 'Pierna' },
    { date: '2024-01-18T08:00:00.000Z', total_volume: '500', exercise_name: 'Pierna' },
    { date: '2024-01-23T08:00:00.000Z', total_volume: '100', exercise_name: 'Pierna' },
  ], referenceDate)

  assert.equal(result.volumePrevious7DaysKg, 1000)
  assert.equal(result.volumeLast7DaysKg, 100)
  assert.equal(result.momentum, 'down')
  assert.ok(result.weeklyTrendPercent < 0)
})