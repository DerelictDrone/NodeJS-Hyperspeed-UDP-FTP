# NodeJS-Hyperspeed-FTP
A NodeJS FTP Commandline Interface for sending/receiving files over UDP.

Uses a "Burst Transmission" strategy until it has sent the entire file with this method.
Afterwards, it will wait for 10 seconds, resetting this timer every time it receives a request for a missing packet.
Once given confirmation, or after 10 seconds without a packet it will return to waiting for a new download.

Packets are numbered with a variably sized uIntLE and a special "encryption" which adds no extra size to files.
(Rot13 based on day of the week for even indexed bytes and day of the month for odd indexed bytes and bitflipped)


Typical upload command:
```
node ftp.js -m u -p 20 -f fun.zip
```
Typical download command:
```
node ftp.js -i 127.0.0.1 -p 20
```


Parameters, they can be in any order.
```
-i (dash lowercase I): Specifies IP we are connecting to during download
-p (dash lowercase P): Specifies port(OPTIONAL, default 20)
-m (dash lowercase M): Specifies mode(OPTIONAL, defaults to "d" for download, use "u" for upload)
-f (dash lowercase F): Specifies filename(OPTIONAL, not required for downloads)
-w (dash lowercase W): How long to wait for more packets before declaring we missed some in MS(default 6000MS aka 6 seconds)
-b (dash lowercase B): Specifies uploaded packet size, end with b or kb for bytes and kilobytes respectively, any fraction of a byte is rounded to nearest neighbor(OPTIONAL, not required for downloads)     
-h (dash lowercase H): Shows this help menu
-c (dash lowercase C): Configures your firewall to use this program, requires administrative rights/an elevated terminal
```
