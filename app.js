#!/usr/bin/env node

'use strict';

/**
* Board Type Selection Variable
* Its value can only be "nanopi", "rockpis" or "orangepizero"
**/
const boardType = 'rockpis';

const express = require('express');
const http = require('http');
const path = require('path');
const app = module.exports.app = express();
const os = require('os');
const server = http.createServer(app);
const serverPort = 80;
const io = require('socket.io')(server);
const fs = require('fs');
const { exec, execSync } = require('child_process');
const validationToken = fs.readFileSync('./security.txt').toString().replace('\n', '');
const httpAuthentication = {"username": "admin", "password": "password"};
const systemFolder = path.join(__dirname, 'sys');
//const availablePins = ['11','12','68','15','16','17','55','54','56','65','64','69','74','73','71','57','76','72','77','78','79','80','75','70']; // For RockPiS
const availablePins = ['1','2','3','4','5','6','7','8','9','10','12','13','14','15','16','17','18','19']; // For NanoPiNEO-LTS
//const availablePins = ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','30']; // For Orange Pi Zero


var ioData;
var sessions = [];
var inputs = [];
var outputs = [];

/* SOFTWARE PERM VALIDATION  */
function control_mac() {
	if(os.networkInterfaces().eth0[0].mac.slice(os.networkInterfaces().eth0[0].mac.toString().length - 5).toString() != validationToken.toString()) {
		console.error('This software is a property of Progettihwsw Sas  and can only be used on permitted machines! Aborting process...');
		http.get('http://www.progetti-hw-sw.com/unpermitted_usage.php?mac=' + os.networkInterfaces().eth0[0].mac);
		process.exit(1);
	}
}
control_mac();
setInterval(control_mac, 10000);

app.use(express.static(path.join(__dirname, 'static')));

app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'static/index.html'));
});

app.get('/getconf', (req, res) => {
	res.end(fs.readFileSync('./conf.json'));
});

app.get('/reboot', (req, res) => {
        if(!req.headers.authorization || req.headers.authorization.indexOf('Basic ') === -1) {
                res.statusCode = 401;
                res.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"');
                res.end('Authorization is required!');
        }
        const base64Credentials = req.headers.authorization.split(' ')[1];
        const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
        const [username, password] = credentials.split(':');
        if(username != httpAuthentication.username || password != httpAuthentication.password) {
                res.statusCode = 401;
                res.write('Invalid Authentication Credentials!');
        }
        try {
                res.send('The request has been sent to the server!');
                execSync('systemctl reboot');
        } catch(e) {
                res.send('An error occured while processing your request. Try again later.');
        }
});

app.get('/static-ip', (req, res) => {
        res.sendFile(path.join(__dirname, 'static/static-ip.html'));
});

app.get('/static-ip/get', (req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/json' });
        res.write('{ "ip-address": "' + os.networkInterfaces().eth0[0].address + '", "gateway-ip-address": "' +  execSync("ip r | grep eth0 | grep default | cut -d ' ' -f 3 | head -n1").toString().replace('\n', '') + '" }');
        res.end();
});

app.get('/static-ip/set', (req, res) => {
        if(!req.headers.authorization || req.headers.authorization.indexOf('Basic ') === -1) {
                res.statusCode = 401;
                res.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"');
                res.end('Authorization is required!');
        }
        const base64Credentials = req.headers.authorization.split(' ')[1];
        const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
        const [username, password] = credentials.split(':');
        if(username != httpAuthentication.username || password != httpAuthentication.password) {
                res.statusCode = 401;
                res.write('Invalid Authentication Credentials!');
        }
        try {
                execSync(`nmcli connection modify 'Wired connection 1' connection.autoconnect yes ipv4.method ${(req.query.dhcp == 'true') ? 'auto' : 'manual'} ipv4.address ${req.query['ip-address']}/24 ipv4.gateway ${req.query['gateway-ip-address']} ipv4.dns 8.8.8.8,8.8.4.4`);
                res.write('IP address has been succesfully set. Please reboot the board to apply the changes.');
                res.end();
        } catch(e) {
                res.write('An error occured while processing your request. Try again later.');
                res.end();
        }
});

app.get('/link/:input/:output', (req, res) => {
	let input = req.params.input.toString();
	let output = req.params.output.toString();
	linkPins(input, output, success => {
		if(success != true) {
			console.log("Error while linking pin " + input + ' to output ' + output + ' on GET request.');
			res.end('Failed to link pins.');
		}
		res.end('Success!');
	});
});

app.get('/rename-board/:name', (req, res) => {
	let name = req.params.name.toString();
	renameBoard(name, success => {
		if(success != true) {
			console.log('Error while renaming board!');
			res.end('Failed to rename board.');
		}
		res.end('Success');
	});
});

app.get('/rename/:pin/:name', (req, res) => {
	let pin = req.params.pin.toString();
        let name = req.params.name.toString();
        renamePin(pin, name, success => {
                if(success != true) {
                        console.log('Error while renaming pin!');
                        res.end('Failed to rename pin.');
                }
                res.end('Success');
        });
});

app.get('/unlink/:pin', (req, res) => {
	let pin = req.params.pin.toString();
	unlinkPin(pin, success => {
		if(success != true) {
			console.log('Error while unlinking pin ' + pin + '.');
			res.end('Failed to unlink pin.');
		}
		res.end('Success!');
	});
});

app.get('/remove/:pin', (req, res) => {
	let pin = req.params.pin.toString();
	removePin(pin, success => {
		if(success != true) {
			console.log('Pin number ' + pin + ' cannot be removed!');
			res.end('Fail to remove pin!');
			return;
		}
		res.end('Success!');
		return;
	});
});

app.get('/set/:pin/:state', (req, res) => {
	let pin = req.params.pin.toString();
	let state = req.params.state.toString();
	if(availablePins.includes(pin) && !(Object.values(ioData.links).includes(pin)) && ioData.controllable_pins[pin] != '0' && (state == 'on' || state == 'off')) {
		let stateNum = state == 'on' ? '1' : '0';
		changeState(pin, stateNum, success => {
			if(success != true) {
				console.error('Error on changing state for pin ' + pin);
				res.end('An internal system error has occured!');
				return;
			}
			res.end('Success!');
		});
	} else {
		res.end('Invalid request parameters!');
	}
});

app.get('/add/:pin/:dir/:timeout?', (req, res) => {
	let pin = req.params.pin.toString();
	let dir = req.params.dir.toString();
	let timeout = req.params.timeout.toString();
	let availableOptions = {
		'as output': '1',
		'monostable': '2',
		'bistable': '1',
		'as input': '0'
	};
	if(!(dir in availableOptions) || !(availablePins.includes(pin))) {
		console.log('Invalid parameters sent to /add/');
		res.end('Invalid request parameters sent!');
		return;
	}
	let mode = availableOptions[dir];
	if(mode == '2' && (!timeout || isNaN(timeout) || timeout < 1)) {
		res.end('Fail: Monostable mode has requested but no timeout has sent!');
		return;
	}
	addPin(pin, mode, (mode == '2' ? timeout : 0), success => {
		if(success != true) {
			console.log('System error while adding new pin');
			res.end('System error while adding new pin!');
			return;
		}
		res.end('Pin number ' + pin + ' has been added ' + dir);
		return;
	});
});

app.get('/data', (req, res) => {
	res.type('application/xml');
	res.write('<?xml version="1.0" ?><Root BoardName="'+ ioData.boardName +'"><Pins>');
	ioData.pinOrder.forEach((item, i) => {
		if(item in ioData.controllable_pins) {
			let direction;
			if(ioData.controllable_pins[item] == '1') { direction = 'Bistable Output'; } else if(ioData.controllable_pins[item] == '2') { direction = 'Monostable Output('+ ioData.timeouts[item] +'ms)'; } else { direction = 'Input'; }
			res.write('<Pin><Name>'+ ioData.pinNames[item] +'</Name><Direction>'+ direction +'</Direction><Value>'+ ((ioData.pinStates[item] == '1') ? 'ON' : 'OFF') +'</Value></Pin>');
		}
	});
	res.write('</Pins></Root>');
	res.end();
});

app.get('/status', (req, res) => {
	res.writeHead(200, { 'Content-Type': 'text/html' });
	res.write(`<style>body{display: flex;flex-direction: column;align-items: center;font-family: 'Arial', sans-serif;}table{ border-collapse: collapse; }td,th {border: 1px solid #ebebeb;padding: 5px 10px;text-align: center}tbody tr:nth-child(odd){background-color: #F4F4F4 }</style>`)
	res.write('<table><thead><tr><th>GPIO Number</th><th>Name</th><th>Direction</th><th>Value</th></tr></thead><tbody>');
	ioData.pinOrder.forEach((item, i) => {
		let direction;
		if(ioData.controllable_pins[item] == '1') {
			direction = 'Bistable Output';
		} else if(ioData.controllable_pins[item] == '2') {
			direction = 'Monostable Output('+ ioData.timeouts[item] +'ms)';
		} else {
			direction = 'Input';
		}
		res.write(`<tr><td>${item}</td><td>${ioData.pinNames[item]}</td><td>${direction}</td><td>${ioData.pinStates[item] == '1' ? 'ON' : 'OFF'}</td></tr>`);
	});
	res.write('</tbody></table>');
	res.end();
});

function addPin(pin, mode, timeout, callback) {
	if(availablePins.includes(pin) && (mode == '0' || mode == '1' || (mode == '2' && !isNaN(timeout) && timeout > 0))) {
		let modeStr = (mode == '0') ? 'in' : 'out';
		let name = (mode == '0') ? 'Input ' + pin : 'Relay ' + pin;
		exec('gpio mode ' + pin + ' ' + modeStr + ' && gpio read ' + pin, (err, stdout, stderr) => {
			if(err) {
				console.error('GPIO Pin Adding Operation Error: ' + err);
				callback(false);
				return;
			}
			if(stderr) {
				console.error('GPIO Pin Adding Operation Error: ' + stderr);
				callback(false);
				return;
			}
			ioData.controllable_pins[pin] = mode;
			let pinState = stdout.toString().replace("\n", "");
			pinState = pinState[pinState.length - 1];
			if(pinState == '1' || pinState == '0') {
				ioData.pinStates[pin] = pinState;
				if(!ioData.pinOrder.includes(pin)) {
					ioData.pinOrder.push(pin);
				}
				if(!ioData.pinNames[pin] || ioData.pinNames[pin] == undefined || ioData.pinNames[pin] == null) {
					ioData.pinNames[pin] = (mode == '0') ? 'Input ' + pin : 'Relay ' + pin; 
				}
				if(mode == '0' && inputs.indexOf(pin) == -1) {
					inputs.push(pin.toString());
				} else if(mode != '0' && outputs.indexOf(pin) == -1) {
					outputs.push(pin.toString());
				}
				emitAllClients('pinHasAdded', {'pin': pin, 'direction': mode, 'name': name});
				emitAllClients('stateHasChanged', {'pin': pin, 'state': pinState});
				callback(true);
			} else {
				console.error('Error while adding pin number ' + pin + '.');
				callback(false);
				return;
			}
		});
	} else {
		console.error('Invalid request on adding new pin!');
		callback(false);
		return;
	}
}

function changeState(pin, state, callback) {
	/*if(Object.values(ioData.links).includes(pin)) {
		ioData.controllable_pins[pin] = '1';
		for(var i in ioData.links) {
			if(ioData.links[i] == pin) {
				emitAllClients('stateHasChanged', {'pin': pin, 'state': ioData.pinStates[i]});
				callback(true);
				return;
			}
		}
	}*/
	if((state == '1' || state == '0') && ioData.controllable_pins[pin] != '0') {
		let stateStr = (state == '1' ? 'on' : 'off');
		exec('gpio write ' + pin + ' ' + stateStr, (err, stdout, stderr) => {
			if(err) {
				console.error(err);
				return false;
			}
			if(stderr) {
				console.log(stderr);
				return false;
			}
			ioData.pinStates[pin] = state;
			if(state == '1' && ioData.controllable_pins[pin] == '2' && !isNaN(ioData.timeouts[pin]) && ioData.timeouts[pin] > 0) {
				setTimeout(() => {
					changeState(pin, 0, success => {
						if(success != true) {
							console.log('Cannot turn off monostable output number ' + pin + '.');
							return;
						}
					});
				}, ioData.timeouts[pin]);
			}
			emitAllClients('stateHasChanged', {'pin': pin, 'state': state});
		});
		callback(true);
	} else {
		console.log('Error at changeState().');
		callback(false);
	}
}

function readState(pin, callback) {
	if(pin in ioData.controllable_pins) {
		let readFilePath = path.join(systemFolder, 'read.sh');
		exec('gpio read ' + pin, (err, stdout, stderr) => {
			if(err) {
				console.error(err);
				return false;
			}
			if(stderr) {
				console.log(stderr);
				return false;
			}
			let output = stdout.toString().replace('\n', '');
			output = output[output.length - 1];
			if(output == '1' || output == '0') {
				ioData.pinStates[pin] = output;
				callback(output);
				return true;
			}
			console.error('Invalid response in read operation.');
			return false;
		});
	} else {
		console.log('Error at readState().');
		return false;
	}
}

function removePin(pin, callback) {
	if(pin in ioData.controllable_pins) {
		delete ioData.controllable_pins[pin];
		delete ioData.pinStates[pin];
		delete ioData.pinNames[pin];
		unlinkPin(pin, success => {
                        if(success != true) {
                                console.log('Error while unlinking pin ' + pin + '.');
                                return;
                        }
                });
		ioData.pinOrder.splice(ioData.pinOrder.indexOf(pin), 1);
		if(inputs.indexOf(pin) > -1) {
			inputs.splice(inputs.indexOf(pin), 1);
		} else if (outputs.indexOf(pin) > -1) {
			outputs.splice(outputs.indexOf(pin), 1);
		}
		emitAllClients('pinHasRemoved', {'pin': pin});
		callback(true);
	}else{
		console.log('Pin cannot be removed(' + pin + ').');
		callback(false);
	}
}

function renamePin(pin, name, callback) {
	if(pin in ioData.controllable_pins && (name != '' || name.length > 0)) {
		ioData.pinNames[pin] = name;
		emitAllClients('pinHasRenamed', {'pin': pin, 'name': name});
		callback(true);
	}else{
		console.log('Pin cannot be renamed(' + pin + ').');
		callback(false);
	}
}

function renameBoard(name, callback) {
	if(name != '' || name.length > 0) {
		ioData.boardName = name;
		emitAllClients('boardHasRenamed', {'name': name});
		callback(true);
	}else{
		console.log('Board cannot be renamed.');
		callback(false);
	}
}

function linkPins(input, output, callback) {
	if(ioData.controllable_pins[input] == '0' && ioData.controllable_pins[output] != '0') {
		ioData.links[input] = output;
		changeState(output, 0, success => {
			if(success != true) {
				console.log('Error on linking pins.');
				return;
			}
			emitAllClients('pinHasBeenLinked', {'input': input, 'output': output});
			return;
		});
	}
}

function initData() {
	let data = fs.readFileSync(path.join(__dirname, 'conf.json'));
	ioData = JSON.parse(data);
	if(!ioData.boardName) {
		ioData.boardName = Math.random().toString(36).slice(2);
	}
	for(let [key, value] of Object.entries(ioData.controllable_pins)) {
		if(!availablePins.includes(key)) {
			console.log("Pin number " + key + " is not valid! Removing it from JSON.");
			delete ioData.controllable_pins[key];
			continue;
		}
		if(!ioData.pinOrder.includes(key)) {
			ioData.pinOrder.push(key);
		}
		let timeout = (value == '2') ? ioData.timeouts[key] : 0;
		addPin(key, value, timeout, (success) => {
			if(success != true) {
				console.log('An error while initializing pin ' + key + ' with mode number ' + value + ' and timeout ' + timeout);
				return;
			}
			if(value != '0' && Object.values(ioData.links).includes(key)) {
				changeState(key, 0, success => {
					if(success != true) {
						console.log('Error on initData while dealing with linked output pin.');
						return;
					}
				});
			}
		});
	}
	saveData();
}

function saveData() {
	let jsonData = JSON.stringify(ioData, null, "\t");
	fs.writeFileSync(path.join(__dirname, 'conf.json'), jsonData, err => {
		if(err) {
			console.error(err);
		}
	});
}

function emitAllClients(event, msg) {
	io.emit(event, msg);
}

function checkInputPins() {
	inputs.forEach(key => {
		let currentState = ioData.pinStates[key];
		readState(key, (out) => {
			if(out != currentState) {
				emitAllClients('stateHasChanged', {'pin': key, 'state': out});
				if(ioData.controllable_pins[key] == '0' && out == '1' && key in ioData.links) {
					if(!(ioData.controllable_pins[ioData.links[key]] == '2' && ioData.pinStates[ioData.links[key]] == '1')) {
						changeState(ioData.links[key], (ioData.pinStates[ioData.links[key]] == '1' ? (ioData.controllable_pins[ioData.links[key]] == '2' ? '1' : '0') : '1'), success => {
							if(success != true) {
								console.log('Error while setting state for linked output pin.');
								return;
							}
							return;
						});
					}
				}
			}
			return;
		});
	});
}
function checkOutputPins() {
	outputs.forEach(key => {
		let currentState = ioData.pinStates[key];
		readState(key, (out) => {
			if(out != currentState) {
				emitAllClients('stateHasChanged', {'pin': key, 'state': out});
				return;
			}
			return;
		});
		return;
	});
}

function unlinkPin(pin, callback) {
	if(pin in ioData.links || Object.values(ioData.links).includes(pin)) {
		if(ioData.controllable_pins[pin] != '0') {
			for(var i in ioData.links) {
				if(ioData.links[i] == pin) {
					delete ioData.links[i];
					emitAllClients('pinHasBeenUnlinked', {'input': i});
					callback(true);
				}
			}
		} else {
			delete ioData.links[pin];
			emitAllClients('pinHasBeenUnlinked', {'input': pin});
			callback(true);
		}
	} else {
		callback(false);
	}
}

function setMonostable(pin, timeout, callback) {
	if(!isNaN(timeout) && timeout > 0 && (ioData.controllable_pins[pin] == '1' || ioData.controllable_pins[pin] == '2')) {
		ioData.timeouts[pin] = timeout;
		ioData.controllable_pins[pin] = '2';
		callback(true);
		return true;
	}
	callback(false);
	return false;
}

function setBistable(pin, callback) {
	if(ioData.controllable_pins[pin] == '1' || ioData.controllable_pins[pin] == '2') {
		ioData.timeouts[pin] = 0;
		ioData.controllable_pins[pin] = '1';
		callback(true);
		return true;
	}
	callback(false);
	return false;
}

function windowsblueStatusUpdater() {
	var queryString = ioData.boardName.replace(/s+/g, '') + '_';
    ioData.pinOrder.forEach((item, i) => {
		if(item.toString() in ioData.controllable_pins) {
			let name = ioData.pinNames[item.toString()];
       		let nameSpaceless = name.replace(/\s+/g, '');
        	let valueStr = (ioData.pinStates[item] == '1') ? 'ON' : 'OFF';
			queryString += nameSpaceless + 'is' + valueStr + '_';
		}
    });
	queryString = queryString.slice(0, -1);
	http.get(`http://windowsblue.it/boards.php?in=${encodeURIComponent(queryString)}`);
}

initData();
setInterval(checkInputPins, 300);
setInterval(checkOutputPins, 4000);
setInterval(saveData, 5000);
//setInterval(windowsblueStatusUpdater, 60000);

/* Socket */

io.on('connection', (socket) => {
	sessions.push(socket.id);

	socket.on('ioRequest', () => {
		socket.emit('gpioData', ioData);
	});

	socket.on('stateChangeRequest', (data) => {
		let pin = data.pin.toString();
		let state = data.state.toString();
		if(Object.values(ioData.links).includes(pin)) {
			console.log('Linked output pins cannot be controlled manually.');
			emitAllClients('stateHasChanged', {'pin': pin, 'state': ioData.pinStates[pin]});
		} else {
			changeState(pin, state, success => {
				if(success != true) { 
					console.log("Error at stateChangeRequest!");
					return;
				}
			});
		}
	});

	socket.on('bistableRequest', (data) => {
		let pin = data.pin.toString();
		setBistable(pin, success => {
			if(success != true) {
				console.log('An error occured while setting bistable pin ' + pin + '.');
				return;
			}
		});
	});

	socket.on('linkToInput', (data) => {
		let input = data.input.toString();
		let output = data.output.toString();
		linkPins(input, output, success => {
			if(success != true) {
				console.log('Error while linking input ' + input + ' to output ' + output + '.');
				return;
			}
		});
	});

	socket.on('unlinkPin', (data) => {
		let pin = data.pin;
		unlinkPin(pin, success => {
                        if(success != true) {
                                console.log('Error while unlinking pin ' + pin + '.');
                                return;
                        }
                });
	});

	socket.on('monostableRequest', (data) => {
		let pin = data.pin.toString();
		let timeout = data.timeout.toString();
		setMonostable(pin, timeout, success => {
			if(success != true) {
				console.log('An error occured while setting monostable pin ' + pin + ' with timeout of ' + timeout + '.');
				return;
			}
		});
	});

	socket.on('newPinRequest', (data) => {
		let pin = data.pin.toString();
		let dir = data.direction.toString();
		addPin(pin, dir, 0, success => {
			if(success != true) {
				console.log('An error occured while adding pin ' + pin + ' with direction number ' + dir);
				return;
			}
		});
	});

	socket.on('removePinRequest', (data) => {
		let pin = data.pin;
		removePin(pin, success => {
			if(success != true) {
				console.log('An error occured while removing pin ' + pin + '.');
				return;
			}
		});
	});

	socket.on('renamePinRequest', (data) => {
		let pin = data.pin;
		let name = data.name;
		renamePin(pin, name, success => {
			if(success != true) {
				console.log('An error occured while renaming pin ' + pin + '.');
				return;
			}
		});
	});

	socket.on('renameBoardRequest', (data) => {
		let name = data.name;
		renameBoard(name, success => {
			if(success != true) {
				console.log('An error occured while renaming board.');
				return;
			}
		});
	});

	socket.on('disconnect', () => {
		console.log('Socket is disconnected with ID: ' + socket.id);
		sessions.splice(sessions.indexOf(socket.id), 1);
	});

});

server.listen(serverPort || '80');
