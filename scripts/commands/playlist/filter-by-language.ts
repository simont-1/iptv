import { Collection, Logger } from '@freearhey/core'
import { OptionValues, program } from 'commander'
import { Stream, Playlist } from '../../models'
import { Storage } from '@freearhey/storage-js'
import { STREAMS_DIR } from '../../constants'
import { PlaylistParser } from '../../core'
import { getStoragePath } from '../../utils'
import { loadData, data } from '../../api'
import cliProgress from 'cli-progress'
import { eachLimit } from 'async'
import os from 'node:os'

program
  .argument('[filepath...]', 'Path to file to filter')
  .option(
    '-p, --parallel <number>',
    'Batch size of streams to test concurrently',
    (value: string) => parseInt(value),
    os.cpus().length
  )
  .option('-x, --proxy <url>', 'Use the specified proxy')
  .option(
    '-t, --timeout <number>',
    'The number of milliseconds before the request will be aborted',
    (value: string) => parseInt(value),
    1000
  )
  .parse(process.argv)

const options: OptionValues = program.opts()

async function main() {
  const logger = new Logger()

  logger.info('loading data from api...')
  await loadData()

  logger.info('loading streams...')
  const streamsStorage = new Storage(STREAMS_DIR)
  const parser = new PlaylistParser({
    storage: streamsStorage
  })
  let files = program.args.length ? program.args : await streamsStorage.list('**/*.m3u')
  files = files.map((filepath: string) => getStoragePath(filepath, STREAMS_DIR))
  let streams = await parser.parse(files)

  logger.info(`found ${streams.count()} streams`)

  logger.info('filtering by language (English/Chinese)...')
  const english = { code: 'eng' }
  const chinese = { code: 'zho' }

  streams = streams.filter((stream: Stream) => {
    return stream.hasLanguage(english) || stream.hasLanguage(chinese)
  })

  logger.info(`kept ${streams.count()} streams (filtered out non-English/Chinese)`)

  logger.info('saving...')
  const groupedStreams = streams.groupBy((stream: Stream) => stream.getFilepath())
  for (const filepath of groupedStreams.keys()) {
    const fileStreams = new Collection(groupedStreams.get(filepath))

    if (fileStreams.isEmpty()) continue

    const playlist = new Playlist(fileStreams, { public: false })
    await streamsStorage.save(filepath, playlist.toString())
  }
}

main()