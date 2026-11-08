// Generates new admin login values for server/.env (or your host's env settings).
// Usage: npm run admin:password -- <username> <password>
//    or: npm run admin:password   (asks interactively)
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import readline from 'readline/promises'

let [username, password] = process.argv.slice(2)

if (!username || !password) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  username = username || (await rl.question('Admin username: ')).trim()
  password = password || (await rl.question('Admin password (min 10 chars): '))
  rl.close()
}

if (!username || !password || password.length < 10) {
  console.error('Username is required and the password must be at least 10 characters.')
  process.exit(1)
}

const hash = bcrypt.hashSync(password, 12)

console.log(`
Put these into server/.env (or the hosting provider's environment variables),
remove any ADMIN_PASSWORD line, then restart the server:

ADMIN_USERNAME=${username}
ADMIN_PASSWORD_HASH=${hash}
JWT_SECRET=${randomBytes(32).toString('hex')}

(A new JWT_SECRET logs out everyone who is currently logged in to /admin.)
`)
