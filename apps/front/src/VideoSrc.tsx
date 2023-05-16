import {
	useEffect,
	useRef,
	VideoHTMLAttributes,
} from 'react'

export const VideoSrc = ({
	srcObject,
	...props
}: VideoHTMLAttributes<HTMLVideoElement> & {
	srcObject?: MediaStream
}) => {
	const ref = useRef<HTMLVideoElement | null>(null)

	useEffect(
		() =>
			void (
				ref.current &&
				srcObject &&
				(ref.current.srcObject = srcObject)
			),
		[srcObject],
	)

	return <video ref={ref} {...props}></video>
}
