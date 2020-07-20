# GPIO Management System
> This software brings the home/industrial automation experience to Linux SBCs easily. Originally developed for Rock Pi S & NanoPi-NEO & OrangePi-Zero boards.

## What does it do?
For a long time, I was researching about a good automation platform for Linux boards. I couldn't find one, but I built one. System exposes a web interface which is very intuitive through a default port of 80. Multiple board instances can be controlled through *one web interface* by IP addresses. This system is also intended to be compatible with other automation softwares such as [Home Assistant](https://github.com/home-assistant/core); for this purpose, I also exposed an HTTP API -*documentation is TBA*- interface.

## How it works under the hood?
The whole system is based on NodeJS & SocketIO technologies. The back-end & front-end codes are completely separate through the SocketIO API. When a board address is entered through the web interface, the client-side Javascript code sends a SocketIO connection request to that hostname and gathers information about that board.

## Installation
Download the latest online bash installation script through the [releases page](https://github.com/ArdaSeremet/SBC-RealTimeIO/releases).

    $ sudo bash auto_install.sh
This script is going to install NodeJS & other dependencies the system needs automatically. You can run it on a bare board installation.

When the installation process finishes, the system will be up and running as a Systemd service named "realtimeio". Systemd service will be automatically started up when the server boots up.

#### Systemd Commands
##### Use sudo privileges while running these commands.
| Command | Description |
| -- | -- |
| systemctl start realtimeio | Starts the system instance. |
| systemctl stop realtimeio | Stops the system instance. |
| systemctl status realtimeio | Shows the current status of the system. |
| systemctl enable realtimeio | Starts the system on server bootup. |
| systemctl disable realtimeio | Doesn't start the system on server bootup. |

## HTTP API Reference
#### HTTP API route list
| Path | Method | Description |
|--|--|--|
| /getconf | GET | Returns the current configuration data. |
| /link/*:input_num*/*:output_num* | GET | Link input pin to an output pin. |
| /unlink/*:pin_num* | GET | Unlink an input or output pin. |
| /rename-board/*:name* | GET | Rename the board. |
| /rename/*:pin_num*/*:name* | GET | Rename a pin. |
| /remove/*:pin* | GET | Remove a pin from system. |
| /set/*:pin_num*/*:state* | GET | Change the state of an output pin. *State can be "on" or "off".* |
| /get/*:pin_num?* | GET | Returns the state of the specified pin. If no parameter has sent, returns all the pin state data as JSON. |
| /add/*:pin*/*:pin_direction*/*:timeout?* | GET | Add a new pin to system. Timeout is optional. Direction can be "monostable" (*Set timeout*), "bistable", "as output" or "as input". |
| /data | GET | Returns the current board data as XML. |

*The more detailed explanation will be added later.*

## Licensing
This software is licensed as per GNU-GPL regulations. This forbids anybody to share their own closed-sourced versions.

