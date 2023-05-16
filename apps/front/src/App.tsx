import {
	Dispatch,
	MutableRefObject,
	SetStateAction,
	useEffect,
	useRef,
	useState,
} from 'react'
import './App.css'
import { Socket, io as skio } from 'socket.io-client'
import { VideoSrc } from './VideoSrc'
import { Updater, useImmer } from 'use-immer'
import { enableMapSet, produce } from 'immer'

type Sid = string

type Sdp<T = string> = {
	from: Sid
	to: Sid
	sdp: T
}

type SdpTo<T> = Omit<Sdp<T>, 'from'>

type St = 'lobby' | 'connecting' | 'connected'

const sid2slug = (sid: Sid, n = 16) => sid.slice(0, n)

const stun = {
	iceServers: [
		{
			urls: 'stun:stun.l.google.com',
		},
	],
}

const mediaConstraints: MediaStreamConstraints = {
	video: {
		width: {
			ideal: 300,
		},
		height: {
			ideal: 300,
		},
	},
}

const setRd = async (
	pc: RTCPeerConnection,
	sdp: RTCSessionDescriptionInit,
) =>
	await pc.setRemoteDescription(
		new RTCSessionDescription(sdp),
	)

const initTracks =
	(localMs: MediaStream | null) =>
	(pc: RTCPeerConnection) =>
		localMs
			?.getTracks()
			.forEach(track => pc.addTrack(track, localMs))

type UseStateTuple<T> = [T, Dispatch<SetStateAction<T>>]
type UseImmerTuple<T> = [T, Updater<T>]

type Ctx = {
	streams: UseImmerTuple<Record<Sid, MediaStream>>
	io: MutableRefObject<Socket | null>
	pcs: MutableRefObject<Record<Sid, RTCPeerConnection>>
	localMs: UseStateTuple<MediaStream | null>
}

const connect = (
	sid: Sid,
	{
		streams: [, setStreams],
		io,
		pcs,
		localMs: [localMs],
	}: Ctx,
) => {
	const pc = new RTCPeerConnection(stun)

	pcs.current[sid] = pc
	initTracks(localMs)(pc)

	pc.addEventListener('negotiationneeded', async () => {
		console.log('neg needed')
		const offer = await pc.createOffer()
		pc.setLocalDescription(offer)

		console.log('send offer-1', offer)

		io.current?.emit('offer-1', {
			to: sid,
			sdp: offer,
		} as SdpTo<RTCSessionDescriptionInit>)
	})

	pc.addEventListener('icecandidate', ice => {
		console.log('new ice 1', ice)

		ice.candidate &&
			io.current?.emit('ice-1', {
				to: sid,
				sdp: ice.candidate.toJSON(),
			} as SdpTo<RTCIceCandidateInit>)
	})

	pc.addEventListener(
		'track',
		(ev: RTCTrackEvent) => (
			console.log('track added', ev),
			setStreams(
				draft => void (draft[sid] = ev.streams[0]),
			)
		),
	)

	pc.addEventListener(
		'iceconnectionstatechange',
		() =>
			pc.iceConnectionState === 'disconnected' &&
			pcs.current[sid] &&
			(pcs.current[sid].close(),
			(pcs.current = produce(
				pcs.current,
				draft => void delete draft[sid],
			)),
			setStreams(draft => void delete draft[sid])),
	)

	return pc
}

function App() {
	const [localMs, setLocalMs] =
		useState<MediaStream | null>(null)
	const [streams, setStreams] = useImmer<
		Record<Sid, MediaStream>
	>({})
	const io = useRef<Socket | null>(null)
	const pcs = useRef<Record<Sid, RTCPeerConnection>>({})
	const [st, setSt] = useState<St>('lobby')

	const ctx: Ctx = {
		streams: [streams, setStreams],
		localMs: [localMs, setLocalMs],
		io,
		pcs,
	}

	const call = () => {
		if (localMs === null)
			return console.log('mediastream is empty')

		setSt('connecting')

		io.current = skio()

		io.current.on('connect', () =>
			console.log('connected to relay'),
		)

		io.current.on('list-2', (others: Array<Sid>) => {
			console.log('list: ', others)

			others.map(sid => connect(sid, ctx))
		})

		io.current.on(
			'answer-2',
			async ({
				sdp,
				from,
			}: Sdp<RTCSessionDescriptionInit>) => (
				console.log('answer 2'),
				await setRd(pcs.current[from], sdp)
			),
		)

		io.current.on(
			'offer-2',
			async ({
				from,
				sdp,
			}: Sdp<RTCSessionDescriptionInit>) => {
				console.log('got offer 2')

				const pc = connect(from, ctx)

				await setRd(pc, sdp)

				const answer = await pc.createAnswer()
				await pc.setLocalDescription(answer)

				console.log('send answer 1', answer)

				io.current?.emit('answer-1', {
					to: from,
					sdp: answer,
				} as SdpTo<RTCSessionDescriptionInit>)
			},
		)

		io.current.on(
			'ice-2',
			async ({
				from,
				sdp,
			}: Sdp<RTCIceCandidateInit>) => (
				console.log('recv ice 2', sdp),
				await pcs.current[from]?.addIceCandidate(
					new RTCIceCandidate(sdp),
				)
			),
		)

		io.current.emit('list-1')
	}

	const cancel = () => {
		console.log('close connection')
		Object.entries(pcs.current).forEach(([sid, pc]) =>
			pc.close(),
		)
		pcs.current = {}
		setStreams({})
		io.current?.disconnect()
		setSt('lobby')
	}

	useEffect(
		() =>
			void (async () =>
				setLocalMs(
					await navigator.mediaDevices.getUserMedia(
						mediaConstraints,
					),
				))(),
		[],
	)

	console.log('==== rerender ====')

	return (
		<>
			<button
				onClick={st === 'lobby' ? call : cancel}
			>
				{st === 'lobby' ? 'Connect' : 'Cancel'}
			</button>
			<ul>
				<div>
					<h2>Local</h2>
					{io.current?.id && (
						<p>
							<code>
								{sid2slug(io.current.id)}
							</code>
						</p>
					)}
					<p>Status: {st}</p>
					<VideoSrc
						autoPlay
						muted
						srcObject={localMs ?? undefined}
					></VideoSrc>
				</div>
				{[...Object.entries(streams)].map(
					([sid, ms]) => (
						<div key={sid}>
							<h2>Remote</h2>
							<p>
								<code>{sid2slug(sid)}</code>
							</p>
							<p>
								Status:{' '}
								{
									pcs.current[sid]
										.connectionState
								}
							</p>
							<VideoSrc
								autoPlay
								muted
								srcObject={ms}
							></VideoSrc>
						</div>
					),
				)}
			</ul>
		</>
	)
}

export default App
