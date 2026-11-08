import fs from 'fs'
import path from 'path'
import mongoose from 'mongoose'

// Integration credentials (Cloudinary, Google Calendar) that the site owner
// can edit from /admin. Stored in MongoDB when it is connected, otherwise in
// a local JSON file. Values saved here take priority over server/.env.

const SETTINGS_KEY = 'integrations'
const SETTINGS_FILE = path.join(process.cwd(), 'server', 'data', 'settings.json')

const SettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { minimize: false })

const Setting = mongoose.models.Setting || mongoose.model('Setting', SettingSchema)

let cache = {}

function isMongoConnected() {
  return mongoose.connection.readyState === 1
}

function readSettingsFile() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return null
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
  } catch (error) {
    console.error('Could not read settings file', error)
    return null
  }
}

function writeSettingsFile(value) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true })
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(value, null, 2), { mode: 0o600 })
}

export async function loadSettings() {
  if (isMongoConnected()) {
    try {
      const doc = await Setting.findOne({ key: SETTINGS_KEY }).lean()
      if (doc?.value) {
        cache = doc.value
        return cache
      }
    } catch (error) {
      console.error('Could not load settings from MongoDB', error)
    }
  }

  cache = readSettingsFile() || {}
  return cache
}

export function getStoredSettings() {
  return cache
}

export async function updateSettingsSection(section, patch) {
  const next = {
    ...cache,
    [section]: {
      ...(cache[section] || {}),
      ...patch,
      updatedAt: new Date().toISOString(),
    },
  }

  if (isMongoConnected()) {
    await Setting.findOneAndUpdate(
      { key: SETTINGS_KEY },
      { key: SETTINGS_KEY, value: next },
      { upsert: true, new: true }
    )
  } else {
    writeSettingsFile(next)
  }

  cache = next
  return cache[section]
}

export async function clearSettingsSection(section) {
  const next = { ...cache }
  delete next[section]

  if (isMongoConnected()) {
    await Setting.findOneAndUpdate(
      { key: SETTINGS_KEY },
      { key: SETTINGS_KEY, value: next },
      { upsert: true, new: true }
    )
  } else {
    writeSettingsFile(next)
  }

  cache = next
}
