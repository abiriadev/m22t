import { Server } from 'socket.io'

type Sdp = {
	from: string
	to: string
	sdp: string
}

type SdpTo = Omit<Sdp, 'from'>

type SdpBroadcastFrom = Omit<Sdp, 'to'>

type SdpBroadcast = Omit<SdpBroadcastFrom, 'from'>

const io = new Server(13008, {
	allowEIO3: true,
	cors: {
		origin: '*',
		credentials: true,
	},
})

const to = (ev: string, msg: SdpTo, id: string) =>
	io.to(msg.to).emit(ev, {
		...msg,
		from: id,
	})

io.on('connection', socket => {
	const { id } = socket

	console.log(`new user connected: `, id)

	socket
		.on('list-1', async () => {
			console.log(`list req from ${id}`)

			socket.emit(
				'list-2',
				(await io.fetchSockets())
					.map(s => s.id)
					.filter(i => i !== id),
			)
		})
		.on('offer-1', (msg: SdpTo) => {
			console.log(`offer from ${id}: `, msg)

			to('offer-2', msg, id)
		})
		.on('answer-1', (msg: SdpTo) => {
			console.log(`answer from ${id}: `, msg)

			to('answer-2', msg, id)
		})
		.on('ice-1', (msg: SdpTo) => {
			console.log(`new ice candidate from ${id}`, msg)

			to('ice-2', msg, id)
		})
		.on('disconnect', () =>
			console.log(`disconnect ${id}`),
		)
})

console.log(`RESTART: ${new Date()}`)
