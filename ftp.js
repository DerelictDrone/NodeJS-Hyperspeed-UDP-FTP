params = process.argv;
const filesystem = require('fs')
if (params.includes('-h')) {
	process.stdout.write('\n\n-i (dash lowercase I): Specifies IP we are connecting to during download\n-p (dash lowercase P): Specifies port(OPTIONAL, default 20)\n-m (dash lowercase M): Specifies mode(OPTIONAL, defaults to "d" for download, use "u" for upload)\n-f (dash lowercase F): Specifies filename(OPTIONAL, not required for downloads)\n-w (dash lowercase W): How long to wait for more packets before declaring we missed some in MS(default 6000MS aka 6 seconds)\n-b (dash lowercase B): Specifies uploaded packet size, end with b or kb for bytes and kilobytes respectively, any fraction of a byte is rounded to nearest neighbor(OPTIONAL, not required for downloads)\n-h (dash lowercase H): Shows this help menu\n-c (dash lowercase C): Configures your firewall to use this program, requires administrative rights/an elevated terminal\n\n')
	process.exit()
}
if (params.includes('-c')) {
	const {
		execSync
	} = require('child_process')
	process.stdout.write('Configuring firewall for NodeJS')
	try {
		execSync(`netsh advfirewall firewall delete rule name="NodeJS FTP(auto-configured)"`)
	} catch {
		// assume we just don't have a previous configuration to clear
	}
	try {
		execSync(`netsh advfirewall firewall add rule name="NodeJS FTP(auto-configured)" dir=out action=allow program="${params[0]}" enable=yes`)
		execSync(`netsh advfirewall firewall add rule name="NodeJS FTP(auto-configured)" dir=in action=allow program="${params[0]}" enable=yes`)
	} catch {
		process.stdout.write('\rFirewall configuration requires administrator access')
		process.exit(1)
	}
	process.stdout.write('\rConfigured firewall for NodeJS ') //intentional extra space, clears the previous text out entirely
	process.exit(1)
}

if (params.length <= 2) {
	process.stdout.write('\nProgram needs at LEAST one parameter(IP)\n Use -i 127.0.0.1 to specify an IP, -h for more help')
	process.exit()
}

let filename;
let mode;
let ip;
let port;
let waitTime;
let desiredBytes;

if (params.includes('-p')) {
	port = parseInt(params[params.indexOf('-p') + 1])
} else {
	port = 20 // the FTP port
}

if (params.includes('-m')) {
	mode = params[params.indexOf('-m') + 1]
	if (mode.toLowerCase() === 'u') {
		filename = params[params.indexOf('-f') + 1]
	}
} else {
	//Assuming download
	mode = 'd'
}

if (params.includes('-i')) {
	ip = params[params.indexOf('-i') + 1]
} else {
	if (mode === 'd') {
		process.stdout.write('\nProgram needs at LEAST one parameter(IP)\n Use -i 127.0.0.1 to specify an IP, -h for more help')
		process.exit()
	} else {
		ip = '0.0.0.0'
	}
}

if (params.includes('-w')) {
	waitTime = parseInt(params[params.indexOf('-w') + 1])
} else {
	waitTime = 6000
}

if (params.includes('-b')) {
	bytes = params[params.indexOf('-b') + 1]
	if (bytes.length > 2 && bytes[bytes.length - 2].toLowerCase() === 'k') {
		desiredBytes = Math.round(parseFloat(bytes) * 1000)
	} else {
		desiredBytes = Math.round(parseFloat(bytes))
	}
	if (desiredBytes < 5) {
		desiredBytes = 5
		process.stdout.write('\nMinimum cannot be less than 5 bytes!! Setting to 5 bytes\n')
	} else if (desiredBytes > 63527) {
		desiredBytes = 63527
		process.stdout.write('\nMaximum cannot be more than 63.527KB!! Setting to 63.527KB\n')
	}
} else {
	desiredBytes = 8000 // More compatibility for regions with lower MTU
}

const udp = require('dgram');

let dotm = new Date().getUTCDate()
let dotw = new Date().getUTCDay()
const Coder = function (code, mode, start = 0, end = code.length) {
	if (mode) {
		//Rot0/6 / Rot0|32 + Bitwise invert, only shifts bytes, so no extra filesize as a result
		for (let i = start; i < end; i++) {
			code[i] = (~code[i] - dotw)
			i++
			if (i < end) {
				code[i] = (~code[i] + dotm)
			}
		}

	} else {
		for (let i = start; i < end; i++) {
			code[i] = ~(code[i] + dotw)
			i++
			if (i < end) {
				code[i] = ~(code[i] - dotm)
			}
		}
	}
}

let MPFLimit = 0
let missedTimer
let sentGoodbye = false
const MissedPacketFix = function (missed, sock, packets, packetsReceived) {
	if (!sentGoodbye) {
		if (MPFLimit > 3) {
			process.exit(1)
		}
		sock.send(missed, port, ip)
		missedTimer = setTimeout(() => {
			MPFLimit++;
			return MissedPacketFix(missed, sock, packets, packetsReceived)
		}, 3000)
	}
}

const sendGoodbye = function (sock, port, ip) {
	sentGoodbye = true
	sock.removeAllListeners('message')
	clearTimeout(missedTimer)
	done = Buffer.from('don')
	Coder(done)
	sock.send(done, port, ip, () => {
		process.exit(0)
	})
}

const CopyStrToBuffer = function (str, buff, strOff = 0, buffOff = 0) {
	prefLength = (buff.length | str.length)
	for (let i = 0; i < prefLength; i++) {
		buff[i + buffOff] = str.charCodeAt(i + strOff)
	}
} // Memory-efficient version of Buffer.from(), only copies to an existing buffer

const AppropriateInt = function (target, size = 8, mode = true, offset = 4, data = 1) {
	if (mode) {
		switch (size) {
			case 8: {
				target[offset] = data;
				break;
			}
			case 16: {
				target.writeUint16LE(data, offset);
				break;
			}
			case 24: {
				target.writeUintLE(data, offset, 3);
				break;
			} //Technically counts as a 24bit?
			case 32: {
				target.writeUint32LE(data, offset);
				break;
			}
			case 64: {
				target.writeBigUint64LE(BigInt(data), offset);
				break;
			}
			default: {
				process.stdout.write("\rUh oh, intSize was not 8, 16, 24, 32, or 64 bits. Exiting now(you should report this on github)");
				process.exit(128)
			}
		}
	} else {
		switch (size) {

			case 8: {
				return target[offset];
			}
			case 16: {
				return target.readUint16LE(offset);
			}
			case 24: {
				return target.readUintLE(offset, 3);
			}
			case 32: {
				return target.readUint32LE(offset);
			}
			case 64: {
				return target.readBigUint64LE(offset);
			}
			default: {
				process.stdout.write("\rUh oh, intSize was not 8, 16, 24, 32, or 64 bits. Exiting now(you should report this on github)");

				process.exit(128)
			}
		}
	}
}

// Async versions of the two above functions, because I need them to use in the async WritePacket

const AsyncCoder = async function (code, mode, start = 0, end = code.length) {
	return new Promise((resolve, reject) => {
		if (mode) {
			//Rot0/6 / Rot0|32 + Bitwise invert, only shifts bytes, so no extra filesize as a result
			for (let i = start; i < end; i++) {
				code[i] = (~code[i] - dotw)
				i++
				if (i < end) {
					code[i] = (~code[i] + dotm)
				}
			}
		} else {
			for (let i = start; i < end; i++) {
				code[i] = ~(code[i] + dotw)
				i++
				if (i < end) {
					code[i] = ~(code[i] - dotm)
				}
			}
		}
		resolve()
	})
}

const AppropriateIntAsync = async function (target, size = 8, mode = true, offset = 4, data = 1) {
	return new Promise((resolve, reject) => {
		if (mode) {
			switch (size) {
				case 8: {
					target[offset] = data;
					break;
				}
				case 16: {
					target.writeUint16LE(data, offset);
					break;
				}
				case 24: {
					target.writeUintLE(data, offset, 3);
					break;
				} //Technically counts as a 24bit?
				case 32: {
					target.writeUint32LE(data, offset);
					break;
				}
				case 64: {
					target.writeBigUint64LE(BigInt(data), offset);
					break;
				}
				default: {
					process.stdout.write("\rUh oh, intSize was not 8, 16, 24, 32, or 64 bits. Exiting now(you should report this on github)");
					process.exit(128)
				}
			}
			resolve()

		} else {
			switch (size) {

				case 8: {
					resolve(target[offset]);
					break
				}
				case 16: {
					resolve(target.readUint16LE(offset));
					break
				}
				case 24: {
					resolve(target.readUintLE(offset, 3));
					break
				}
				case 32: {
					resolve(target.readUint32LE(offset));
					break
				}
				case 64: {
					resolve(target.readBigUint64LE(offset));
					break
				}
				default: {
					process.stdout.write("\rUh oh, intSize was not 8, 16, 24, 32, or 64 bits. Exiting now(you should report this on github)");

					process.exit(128)
				}
			}
		}
	})
}

calculateIntSize = function (number) {
	if (number <= 256) {
		return 8
	} else if (
		number <= 65536
	) {
		return 16
	} else if (
		number <= 16777215
	) {
		return 24
	} else if (
		number <= 4294967296
	) {
		return 32
	} else if (
		number <= 18446744073700000000
	) {
		return 64
	}
}

if (mode === 'd') {
	process.on('exit', () => {
		if (!sentGoodbye) {
			process.stdout.write('\n\rDownload terminated.')
			sendGoodbye(sock, port, ip) // Terminate download if anything bad happens to the program
		}
	})
	process.on('SIGINT', () => {
		sendGoodbye(sock, port, ip)
	})
	let notConnected = true
	setTimeout(() => {
		if (notConnected) {
			process.stdout.write('No response!')
			process.exit(1)
		} else {
			notConnected = null
		}
	}, 10000);
	const sock = udp.createSocket('udp4')
	sock.bind(port)

	notConnected = false
	process.stdout.write('\rAwaiting response')
	let noResponse = true
	setTimeout(() => {
		if (noResponse) {
			process.stdout.write('\rTimed out waiting for response')
			process.exit(1)
		} else {
			noResponse = null
		}
	}, 10000)
	hello = Buffer.from('fil')
	Coder(hello, true)
	sock.send(hello, port, ip)
	sock.on('message', (msg) => {
		dotm = new Date().getUTCDate()
		dotw = new Date().getUTCDay()
		if (msg.includes('nam', 0x00, 'utf8') && noResponse) {
			noResponse = false
			headerSize = msg[3]
			packetLengthSize = msg[4]
			let packets = 0
			let filename
			decoded = msg.slice((headerSize / 8) + (packetLengthSize / 8) + 5, msg.length)
			const startDownload = function () {
				sock.removeListener('message', () => {})
				process.stdin.removeListener('data', () => {})
				process.stdin.setRawMode(false)
				sock.setRecvBufferSize(65527)
				let file = []
				let packetsReceived = 0
				let timer = setTimeout(() => {
					process.stdout.write('\rConnection established, but no response after')
					process.exit(3) // The loneliest number
				}, 5000)
				sock.on('message', (msg) => {
					downloadPercent = ((packetsReceived / packets) * 100).toFixed(2)
					process.stdout.write('\r' + downloadPercent + '% [' + packetsReceived.toString() + ']')
					clearTimeout(timer)
					currentPacket = AppropriateInt(msg, headerSize, false, 0)
					packetsReceived++
					packet = Buffer.from(msg.slice(headerSize / 8))
					Coder(packet, false)
					file[currentPacket] = packet
					timer = setTimeout(() => {
						if (packetsReceived >= packets) {
							process.stdout.write('\rWriting File!')
							sendGoodbye(sock, port, ip)
							filesystem.writeFileSync(filename, Buffer.concat(file), {
								encoding: 'utf8'
							})
							process.stdout.write('\rAll done!    ')
						} else {
							let missedPackets = []
							for (let i = 0; i < packets; i++) {
								if (file[i] === undefined) {
									missedPackets.push(i)
								}
							}
							process.stdout.write('\rDoubling back for missed packets\n[' + packetsReceived + ']')
							currentMissedPacket = Buffer.allocUnsafe(3 + headerSize / 8)
							CopyStrToBuffer('mis', currentMissedPacket)
							Coder(currentMissedPacket, true, 0, 3)
							AppropriateInt(currentMissedPacket, headerSize, true, 3, missedPackets[0] + 1)
							missedPackets.shift()
							MissedPacketFix(currentMissedPacket, sock, packets, packetsReceived)
							sock.removeAllListeners('message')
							sock.on('message', (msg) => {
								process.stdout.write('\r[' + packetsReceived + ']')
								MPFLimit = 0 // reset number of misses before giving up
								clearTimeout(missedTimer)
								currentPacket = AppropriateInt(msg, headerSize, false, 0)
								packetsReceived++
								packet = Buffer.from(msg.slice(headerSize / 8))
								Coder(packet, false)
								file[currentPacket - 1] = packet
								AppropriateInt(currentMissedPacket, headerSize, true, 3, missedPackets[0] + 1)
								if (missedPackets.length === 0) {
									process.stdout.write('\rWriting File!')
									sendGoodbye(sock, port, ip)
									filesystem.writeFileSync(filename, Buffer.concat(file), {
										encoding: 'utf8'
									})
									process.stdout.write('\rAll done!    ')
								}
								if (!sentGoodbye) {
									missedPackets.shift()
									MissedPacketFix(currentMissedPacket, sock, packets, packetsReceived)
								}
							})

						}
					}, waitTime)
				})
				down = Buffer.from('down')
				Coder(down, true)
				sock.send(down, port, ip)

			}

			Coder(decoded, false)
			packets = AppropriateInt(msg, headerSize, false, 5)
			bytesPerPacket = AppropriateInt(msg, packetLengthSize, false, (headerSize / 8) + 5)
			filename = decoded.toString()
			process.stdout.write('\nFilename is: "' + decoded.toString() + '", and ' + packets + ' packets long at ' + bytesPerPacket + '(' + bytesPerPacket / 1000 + 'KB)' + ' bytes per packet.\nDo you want to download?\n\nY/N')
			process.stdin.resume()
			process.stdin.setRawMode(true)
			process.stdin.setDefaultEncoding('utf-8')
			process.stdin.on('data', (data) => {
				if (data.toString().toLowerCase() === 'y') {
					startDownload()
				} else if (data.toString().toLowerCase() === 'n') {
					process.stdout.write('\r   \nUnderstandable, have a pleasant day.')
					process.exit(0)
				}
			})
		} else {
			if (noResponse) {
				Coder(msg, false)
				if (!(msg.includes('busy', 0x00, 'utf8'))) {
					process.stdout.write("\rPacket was received, but wasn't a handshake\nExiting\n")
					process.exit(1)
				} else if (msg.length === 4 && msg.includes('busy', 0x00, 'utf8')) {
					process.stdout.write("\rServer is busy, try again later.\n")
					process.exit(5)
				}
			}
		}
	})

} else {
	const sock = udp.createSocket('udp4')
	// 8 = 256 aka 1 byte
	// 16 = 65536 aka 2 byte
	// 24 = 16777215 aka 3 byte
	// 32 = 4294967296 aka 4 byte
	// 64 = 18446744073700000000 aka 8 byte
	fileContents = filesystem.readFileSync(filename)
	if (fileContents.length > 9370945989440000000000) {
		// UPDATE: NodeJS can't actually handle opening a file larger than 2GB so we're safe, for now. (11/15/2021 MM/DD/YYYY)
		// I will most likely die of old age before we ever hit a point where we need to upload a single 9 ZettaByte file (11/10/2021 MM/DD/YYYY)
		process.stdout.write("\nSorry, but we don't support files bigger than 9 ZettaBytes because we use a 64bit unsigned integer to store the packet number.\nConsider splitting the file into 1 ZettaByte chunks if you REALLY need to do this.")
		process.exit(0x00F) //OOF
	}
	let headerSize = 8
	let packets = Math.ceil(fileContents.length / desiredBytes)
	headerSize = calculateIntSize(packets)
	packetLengthSize = calculateIntSize(desiredBytes)
	let coded = Buffer.allocUnsafe(desiredBytes) // Header will be a LE int

	// I am ashamed to have to do this, but I don't know a perfect mathematical solution to draw out the number of bytes these would take up from their maximum number
	sock.bind(port, ip) // Specified IP address or 0.0.0.0 if none

	let downloads = 0;
	let rudenessTimer
	WritePacket = async function (buffer, fileContents, packetNum, payloadLength, payloadsSent) {
		return new Promise(async (resolve, reject) => {
			downloadPercent = ((payloadsSent / (payloadLength * packets - 1)) * 100).toFixed(2)
			process.stdout.write('\rDownload at ' + downloadPercent + '%')
			fileContents.slice(payloadsSent, fileContents.length).copy(buffer, headerSize / 8, 0, payloadLength)
			p1 = AppropriateIntAsync(buffer, headerSize, true, 0, packetNum)
			p2 = AsyncCoder(buffer, true, (headerSize / 8))
			await Promise.all([p1, p2])
			resolve()
		})
	}
	WaitForPacket = async function (packet, port, client) {
		return new Promise((resolve, reject) => {
			sock.send(packet, port, client, () => {
				clearTimeout(rudenessTimer)
				rudenessTimer = setTimeout(() => {
					awaitClient()
				}, 10000)
				resolve()
			})
		})
	}

	const startUpload = async function (client, port) {
		sock.removeAllListeners('message', () => {})
		let payloadsSent = 0
		payloadLength = desiredBytes - (headerSize / 8)
		rudenessTimer = setTimeout(() => {
			awaitClient() // Client didn't say goodbye before disappearing for 10 seconds, how rude of them.
		}, 10000)
		sock.on('message', async (msg, rinfo) => {
			Coder(msg, false, 0, 3)
			if (msg.includes('mis', 0, 'utf8')) {
				desiredPacket = AppropriateInt(msg, headerSize, false, 3)
				packetDiff = packets - desiredPacket
				payloadsSentCopy = payloadsSent
				for (let i = 0; i < packetDiff; i++) {
					payloadsSentCopy -= payloadLength
				}
				if (desiredPacket === packets) { // check for if this is the last packet or not
					await WritePacket(coded, fileContents, desiredPacket, payloadLength, payloadsSentCopy)
					lastPacket = coded.slice(0, (fileContents.length + headerSize / 8) - payloadsSentCopy)
					await WaitForPacket(lastPacket, port, client, true)
				} else {
					await WritePacket(coded, fileContents, desiredPacket, payloadLength, payloadsSentCopy)
				}
				await WaitForPacket(coded, port, client, true)
			} else if (!msg.includes('don', 0, 'utf8')) {
				working = Buffer.from('busy')
				Coder(working, true)
				sock.send(working, port, rinfo.address)
			} else {
				clearTimeout(rudenessTimer) // Make absolute sure we don't terminate early because of this timer being left behind
				awaitClient()
			}
		})
		sock.setSendBufferSize(63527 | desiredBytes)
		process.stdout.write('\rDownload started')
		for (let i = 0; i < packets; i++) {
			if (fileContents.length - payloadsSent > payloadLength) {
				await WritePacket(coded, fileContents, i, payloadLength, payloadsSent)
				await WaitForPacket(coded, port, client, true)
				payloadsSent += payloadLength
			} else {
				lastPacket = coded.slice(0, (fileContents.length + headerSize / 8) - payloadsSent)
				await WritePacket(lastPacket, fileContents, i, payloadLength, payloadsSent)
				await WaitForPacket(lastPacket, port, client)
			}
		}
		downloads++
	}
	const awaitClient = function () {
		process.stdout.write('\rDownloads served (' + downloads + ')')
		sock.removeAllListeners('message', () => {})
		sock.on('message', (msg, rinfo) => {
			Coder(msg, false)
			if (msg.toString() === 'fil') {
				dotm = new Date().getUTCDate()
				dotw = new Date().getUTCDay()
				x = Buffer.allocUnsafe(5 + (headerSize / 8) + (packetLengthSize / 8) + filename.length)
				CopyStrToBuffer('nam', x)
				AppropriateInt(x, headerSize, true, 5, packets)
				AppropriateInt(x, packetLengthSize, true, 5 + (headerSize / 8), desiredBytes)
				x[3] = headerSize
				x[4] = packetLengthSize
				CopyStrToBuffer(filename, x, 0, (headerSize / 8) + (packetLengthSize / 8) + 5)
				Coder(x, true, (headerSize / 8) + (packetLengthSize / 8) + 5)
				sock.send(x, port, rinfo.address)
			} else if (msg.includes('dow', 0, 'utf8')) {
				startUpload(rinfo.address, port)
			}
		})
	}

	awaitClient()
}