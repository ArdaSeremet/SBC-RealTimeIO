#!/usr/bin/env node

const express = require('express');
const http = require('http');
const path = require('path');
const app = module.exports.app = express();
const os = require('os');
const CronJob = require('cron').CronJob; // Used for task scheduling system.
const server = http.createServer(app);
const serverPort = 80;
const io = require('socket.io')(server);
const fs = require('fs');
const { exec, execSync } = require('child_process');
const validationToken = fs.readFileSync('./security.txt').toString().replace('\n', '');
const httpAuthentication = {
	"username": "admin",
	"password": "password"
};
const interfaceName = 'wlan0'; // Change these values for your connection!
const nmInterfaceName = 'Arda';
const systemFolder = path.join(__dirname, 'sys');
const systemLogsFile = path.join(__dirname, 'static/logs.txt');
const nodeName = execSync('uname -n').toString().replace('\n', '');

const availableTaskTypes = ['turnOn', 'turnOff', 'unlink', 'linkToInput', 'setMonostable', 'setBistable'];

let ioData = {};
let sessions = [];
let inputs = [];
let outputs = [];
let runningTasks = {};

const unsupportedBoard = () => {
	console.error(`Unsupported board type (${nodeName})! Exiting...`);
	process.exit(1);
};

/**
 * TODO
 * The nodeName technique might be changed to something more appropriate.
 */
if(nodeName == "NanoPi-NEO") {
	const availablePins = ['1','2','3','4','5','6','7','8','9','10','12','13','14','15','16','17','18','19'];
} else if(nodeName == "orangepizero") {
	const availablePins = ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','30'];
} else if(nodeName == "rockpis") {
	const availablePins = ['11','12','68','15','16','17','55','54','56','65','64','69','74','73','71','57','76','72','77','78','79','80','75','70'];
} else {
	unsupportedBoard();
}

app.use(function(req, res, next) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	next();
});

app.use(express.static(path.join(__dirname, 'static')));

app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'static/index.html'));
});

app.get('/getconf', (req, res) => {
	res.end(json_encode(ioData));
});

app.get('/settings', (req, res) => {
	res.sendFile(path.join(__dirname, 'static/settings.html'));
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

	let ip = os.networkInterfaces().wlan0[0].address;
	let gateway = execSync(`ip r | grep ${interfaceName} | grep default | cut -d ' ' -f 3 | head -n1`).toString().replace('\n', '');
	let dhcp = execSync(`nmcli c s ${nmInterfaceName} | grep "ipv4.method" | tail -c 5`).toString().replace('\n', '') == 'auto' ? 'true' : 'false';

	res.write(`{
		"ip-address": "${ip}",
		"gateway-ip-address": "${gateway}",
		"dhcp": "${dhcp}"
	}`);
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
		let method = (req.query.dhcp == 'true') ? 'auto' : 'manual';
		let gateway = req.query['gateway-ip-address'];
		let ip = req.query['ip-address'];

		execSync(`nmcli connection modify '${nmInterfaceName}' connection.autoconnect yes ipv4.method ${method} ipv4.addresses ${ip}/24 ipv4.gateway ${gateway} ipv4.dns 8.8.8.8,8.8.4.4`);
		res.write('IP address has been succesfully set. Please reboot the board to apply the changes.');
		res.end();
	} catch(e) {
		res.write('An error occured while processing your request. Try again later.');
		res.end();
	}
});

/**
 * This function is to bring the backwards compatibility to all ProgettiHWSW.com automation boards.
 */
app.get('/index.htm', (req, res) => {
	let command = parseInt(req.query.execute);

	if(!isNaN(command) && command > 0) {
		if(command >= 200) {
			let pinNumber = command - 200;
			if(pinNumber in ioData.controllable_pins) {
				changeState(pinNumber, '1', success => {
					if(success != true) {
						res.write('An error occured');
						res.end();
						return;
					}
					setTimeout(() => {
						changeState(pinNumber, '0', success => {
							if(success != true) {
								return;
							}
						});
					}, 3000);
					res.write('Success');
					res.end();
				});
			}
		} else if(command >= 116 && command < 200) {
			let pinNumber = command - 116;
			if(pinNumber in ioData.controllable_pins) {
				changeState(pinNumber, '0', success => {
					if(success != true) {
						res.write('An error occured');
						res.end();
						return;
					}
					res.write('Success');
					res.end();
				});
			}
		} else if(command >= 16 && command < 116) {
			let pinNumber = command - 16;
			if(pinNumber in ioData.controllable_pins) {
				changeState(pinNumber, '1', success => {
					if(success != true) {
						res.write('An error occured');
						res.end();
						return;
					}
					res.write('Success');
					res.end();
				});
			}
		} else if(command >= 0 && command < 16) {
			let pinNumber = command;
			if(pinNumber in ioData.controllable_pins) {
				readState(pinNumber, state => {
					if(state != true) {
						res.write('An error occured');
						res.end();
						return;
					}
					let changeTo = (state == '1') ? '0' : '1';
					changeState(pinNumber, changeTo, success => {
						if(success != true) {
							res.write('An error occured');
							res.end();
							return;
						}
						res.write('Success');
						res.end();
					});
				});
			}
		} else {
			res.write('Invalid command sent!');
			res.end();
		}
	} else {
		res.write('Error');
		res.end();
	}
});

app.get('/link/:input/:output', (req, res) => {
	let input = req.params.input.toString();
	let output = req.params.output.toString();
	linkPins(input, output, success => {
		if(success != true) {
			console.log(`Error while linking pin ${input} to output ${output} on GET request.`);
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
			console.log(`Error while unlinking pin ${pin}.`);
			res.end('Failed to unlink pin.');
		}
		res.end('Success!');
	});
});

app.get('/remove/:pin', (req, res) => {
	let pin = req.params.pin.toString();
	removePin(pin, success => {
		if(success != true) {
			console.log(`Pin number ${pin} cannot be removed!`);
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
				console.error(`Error on changing state for pin ${pin}.`);
				res.end('An internal system error has occured!');
				return;
			}
			res.end('Success!');
		});
	} else {
		res.end('Invalid request parameters!');
	}
});

app.get('/get/:pin', (req, res) => {
	res.writeHead(200, { 'Content-Type': 'text/json' });
	let pin = req.params.pin.toString();
	if(pin == null || pin == '' || pin == undefined) {
		let dataOut = '[';
		for(let pin in ioData.controllable_pins) {
			dataOut += `{"pin": "${pin}", "state": "${ioData.pinStates[pin]}"},`;
		}
		dataOut = dataOut.slice(0, -1);
		dataOut += ']';
		res.end(dataOut);
	} else {
		if(!(availablePins.includes(pin))) {
			res.end('Invalid pin!');
			return;
		}
		res.end(`{"pin": "${pin}", "state": "${ioData.pinStates[pin]}"}`);
	}
	return;
});

app.get('/add/:pin/:dir/:timeout?', (req, res) => {
	let pin = req.params.pin.toString();
	let dir = req.params.dir.toString();
	let timeout = '0';
	if(req.params.timeout) {
		timeout = req.params.timeout.toString();
	}
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
		res.end(`Pin number ${pin} has been added ${dir}.`);
		return;
	});
});

app.get('/data', (req, res) => {
	res.type('application/xml');
	res.write(`<?xml version="1.0" ?><Root BoardName="${ioData.boardName}"><Pins>`);
	ioData.pinOrder.forEach((item, i) => {
		if(item in ioData.controllable_pins) {
			let direction;
			if(ioData.controllable_pins[item] == '1') {
				direction = 'Bistable Output';
			} else if(ioData.controllable_pins[item] == '2') {
				direction = `Monostable Output(${ioData.timeouts[item]}ms)`;
			} else {
				direction = 'Input';
			}
			res.write(`<Pin><Name>${ioData.pinNames[item]}</Name><PinNumber>${item}</PinNumber><Direction>${direction}</Direction><Value>${(ioData.pinStates[item] == '1') ? 'ON' : 'OFF'}</Value></Pin>`);
		}
	});
	res.write('</Pins></Root>');
	res.end();
});

app.get('/status', (req, res) => {
	res.writeHead(200, { 'Content-Type': 'text/html' });
	res.write(`<style>body{display: flex;flex-direction: column;align-items: center;font-family: 'Arial', sans-serif;}table{ border-collapse: collapse; }td,th {border: 1px solid #ebebeb;padding: 5px 10px;text-align: center}tbody tr:nth-child(odd){background-color: #F4F4F4 }</style>`);
	res.write('<table><thead><tr><th>GPIO Number</th><th>Name</th><th>Direction</th><th>Value</th></tr></thead><tbody>');
	ioData.pinOrder.forEach((item, i) => {
		let direction;
		if(ioData.controllable_pins[item] == '1') {
			direction = 'Bistable Output';
		} else if(ioData.controllable_pins[item] == '2') {
			direction = `Monostable Output(${ioData.timeouts[item]}ms)`;
		} else {
			direction = 'Input';
		}
		res.write(`<tr><td>${item}</td><td>${ioData.pinNames[item]}</td><td>${direction}</td><td>${ioData.pinStates[item] == '1' ? 'ON' : 'OFF'}</td></tr>`);
	});
	res.write('</tbody></table>');
	res.end();
});

const addPin = (pin, mode, timeout, callback) => {
	if(availablePins.includes(pin) && (mode == '0' || mode == '1' || (mode == '2' && !isNaN(timeout) && timeout > 0))) {
		let modeStr = (mode == '0') ? 'in' : 'out';
		let name = (mode == '0') ? `Input ${pin}` : `Relay ${pin}`;
		let command = '';

		if(nodeName == 'NanoPi-NEO' || nodeName == 'orangepizero') {
			command = `gpio mode ${pin} ${modeStr} && gpio read ${pin}`;
		} else if(nodeName == 'rockpis') {
			command = `bash sys/${modeStr}.sh ${pin} && bash sys/read.sh ${pin}`;
		} else {
			unsupportedBoard();
		}

		exec(command, (err, stdout, stderr) => {
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
				io.emit('pinHasAdded', {'pin': pin, 'direction': mode, 'name': name});
				io.emit('stateHasChanged', {'pin': pin, 'state': pinState});
				callback(true);
			} else {
				console.error(`Error while adding pin number ${pin}.`);
				callback(false);
				return;
			}
		});
	} else {
		console.error('Invalid request on adding new pin!');
		callback(false);
		return;
	}
};

const changeState = (pin, state, callback) => {
	if((state == '1' || state == '0') && ioData.controllable_pins[pin] != '0') {
		let stateStr = (state == '1' ? 'on' : 'off');
		let command = '';

		if(nodeName == 'NanoPi-NEO' || nodeName == 'orangepizero') {
			command = `gpio write ${pin} ${stateStr}`;
		} else if(nodeName == 'rockpis') {
			command = `bash sys/${stateStr}.sh ${pin}`;
		} else {
			unsupportedBoard();
		}

		exec(command, (err, stdout, stderr) => {
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
			io.emit('stateHasChanged', {'pin': pin, 'state': state});
		});
		callback(true);
	} else {
		console.log('Error at changeState().');
		callback(false);
	}
};

const readState = (pin, callback) => {
	if(pin in ioData.controllable_pins) {
		let command = '';

		if(nodeName == 'NanoPi-NEO' || nodeName == 'orangepizero') {
			command = `gpio read ${pin}`;
		} else if(nodeName == 'rockpis') {
			command = `bash sys/read.sh ${pin}`;
		} else {
			unsupportedBoard();
		}

		exec(command, (err, stdout, stderr) => {
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
				ioData.pinStates[pin] = output.toString();
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
};

const removePin = (pin, callback) => {
	if(pin in ioData.controllable_pins) {
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
		delete ioData.controllable_pins[pin];
		delete ioData.pinStates[pin];
		delete ioData.pinNames[pin];
		io.emit('pinHasRemoved', {'pin': pin});
		callback(true);
	}else{
		console.log('Pin cannot be removed(' + pin + ').');
		callback(false);
	}
};

const renamePin = (pin, name, callback) => {
	if(pin in ioData.controllable_pins && (name != '' || name.length > 0)) {
		ioData.pinNames[pin] = name;
		io.emit('pinHasRenamed', {'pin': pin, 'name': name});
		callback(true);
	}else{
		console.log('Pin cannot be renamed(' + pin + ').');
		callback(false);
	}
};

const renameBoard = (name, callback) => {
	if(name != '' || name.length > 0) {
		ioData.boardName = name;
		io.emit('boardHasRenamed', {'name': name});
		callback(true);
	}else{
		console.log('Board cannot be renamed.');
		callback(false);
	}
};

const linkPins = (input, output, callback) => {
	if(ioData.controllable_pins[input] == '0' && ioData.controllable_pins[output] != '0') {
		ioData.links[input] = output;
		changeState(output, 0, success => {
			if(success != true) {
				console.log('Error on linking pins.');
				return;
			}
			io.emit('pinHasBeenLinked', {'input': input, 'output': output});
			return;
		});
	}
};

const initData = () => {
	const _confPath = path.join(__dirname, 'conf.json');
	let data = {};

	if(fs.existsSync(_confPath)) {
		data = fs.readFileSync(_confPath);
	}

	ioData = JSON.parse(data);

	ioData.initTime = new Date();
	if(!ioData.boardName || ioData.boardName == '' || ioData.boardName == null) {
		ioData.boardName = Math.random().toString(36).slice(2);
	}
	if(!(Object.keys(ioData).includes("controllable_pins"))) {
		ioData.controllable_pins = {};
	}
	for(const [key, value] of Object.entries(ioData.controllable_pins)) {
		if(!availablePins.includes(key)) {
			console.log("Pin number " + key + " is not valid! Removing it from JSON.");
			delete ioData.controllable_pins[key];
			continue;
		}
		if(!(ioData.pinOrder.includes(key))) {
			ioData.pinOrder.push(key);
		}
		const _timeout = (value == '2') ? ioData.timeouts[key] : '0';
		const _isLinkedOutput = (value != '0') ? (Object.values(ioData.links).includes(key)) : false;
		
		addPin(key, value, _timeout, (success) => {
			if(success != true) {
				// TODO: Fix Error Logging //console.log('An error while initializing pin ' + key + ' with mode number ' + value + ' and timeout ' + _timeout);
				return;
			}
			if(value != '0' && _isLinkedOutput) {
				changeState(key, 0, success => {
					if(success != true) {
						// TODO: Fix Error Logging //console.log('Error on initData while dealing with linked output pin.');
						return;
					}
				});
			}
		});
	}
	initTasks();
	saveData();
};

const newTask = (cronData, initExisting, uniqueId) => {
	if(uniqueId == null || uniqueId == undefined || uniqueId == '') {
		uniqueId = Math.random().toString(36).slice(2);
	}
	if(initExisting != true) {
		ioData.activeTasks[uniqueId] = cronData;
	}
	let taskName = cronData.taskName;
	let taskType = cronData.taskType;
	let datetime = cronData.datetime;
	let taskValue = cronData.taskValue;
	let outputPin = cronData.outputPinNumber;
	let repeatEveryday = cronData.repeatEveryday;
	if(repeatEveryday != '' && repeatEveryday != null && taskName != '' && taskName != null && taskType != '' && availableTaskTypes.includes(taskType) && datetime != '' && outputPin != '' && outputPin in ioData.controllable_pins && ioData.controllable_pins[outputPin] != '0') {
		let dateString = new Date(datetime + '+02:00');
		let dateNow = new Date();
		if(dateString <= 0) {
			console.log('Date value supplied to createTask is invalid.');
			removeTask(uniqueId);
			return;
		}
		if(dateNow > dateString) {
			console.log('Past date cannot be passed to tasks.');
			removeTask(uniqueId);
			return;
		}
		let task = new CronJob((repeatEveryday == 'on') ? `${dateString.getMinutes()} ${dateString.getHours()} * * *` : dateString, () => {
			console.log('task: ' + taskName);
			if(taskType == 'turnOn' && !(Object.values(ioData.links).includes(outputPin))) {
				changeState(outputPin, '1', status => {
					if(status == false) {
						console.log('Cannot turn on pin number ' + outputPin);
					}
					return;
				});
			} else if(taskType == 'turnOff' && !(Object.values(ioData.links).includes(outputPin))) {
				changeState(outputPin, '0', status => {
					if(status == false) {
						console.log('Cannot turn off pin number ' + outputPin);
					}
					return;
				});
			} else if(taskType == 'unlink' && Object.values(ioData.links).includes(outputPin)) {
				unlinkPin(outputPin, status => {
					if(status == false) {
						console.log('Cannot unlink pin number ' + outputPin);
					}
					return;
				});
			} else if(taskType == 'linkToInput' && taskValue in ioData.controllable_pins && ioData.controllable_pins[taskValue] == '0') {
				linkPins(taskValue, outputPin, status => {
					if(status == false) {
						console.log('Cannot link input pin number ' + taskValue + ' to output pin number ' + outputPin + '.');
					}
					return;
				});
			} else if(taskType == 'setBistable') {
				setBistable(outputPin, status => {
					if(status == false) {
						console.log('Cannot set pin number ' + outputPin + ' as a bistable output.');
					}
					return;
				});
			} else if(taskType == 'setMonostable' && !isNaN(taskValue) && taskValue > 0) {
				setMonostable(outputPin, taskValue, status => {
					if(status == false) {
						console.log('Cannot set pin number ' + outputPin + ' as a monostable output with timeout of' + taskValue + '.');
					}
					return;
				});
			} else {
					console.log('Unexpected task type or a linked output pin.');
			}
			if(repeatEveryday != 'on') {
				removeTask(uniqueId);
			}
		});
		task.start();
		runningTasks[uniqueId] = task;
		cronData.uniqueId = uniqueId;
		io.emit('newTaskCreated', cronData);
	} else {
		console.log('One of the tasks is invalid. Removing it...');
		removeTask(uniqueId);
		return;
	}
};

const initTasks = () => {
	for(let [uniqueId, cronData] of Object.entries(ioData.activeTasks)) {
		newTask(cronData, true, uniqueId);
		continue;
	}
};

const removeTask = uniqueId => {
	if(uniqueId in ioData.activeTasks) {
		if(uniqueId in runningTasks) {
			let taskInstance = runningTasks[uniqueId];
			let stopTask = taskInstance.stop();
			if(stopTask != false) {
				console.log('Task Removed: ' + ioData.activeTasks[uniqueId].taskName);
			} else {
				console.log('Task Not Removed: ' + ioData.activeTasks[uniqueId].taskName);
				return;
			}
		}
		delete ioData.activeTasks[uniqueId];
		io.emit('taskHasBeenRemoved', {'uniqueId': uniqueId});
	}
};

const saveData = () => {
	let jsonData = JSON.stringify(ioData, null, "\t");
	try { // Check the validity of stringified JSON object.
		let parse = JSON.parse(jsonData);
	} catch(e) {
		console.log('Invalid JSON object to store!');
		console.dir(jsonData);
		return false;
	}
	fs.writeFileSync('conf.json', jsonData);
};

const checkInputPins = () => {
	inputs.forEach(key => {
		let currentState = ioData.pinStates[key];
		readState(key, (out) => {
			if(out != currentState) {
				io.emit('stateHasChanged', {'pin': key, 'state': out});
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
};

const checkOutputPins = () => {
	outputs.forEach(key => {
		let currentState = ioData.pinStates[key];
		readState(key, (out) => {
			if(out != currentState) {
				io.emit('stateHasChanged', {'pin': key, 'state': out});
				return;
			}
			return;
		});
		return;
	});
};

const unlinkPin = (pin, callback) => {
	if(pin in ioData.links || Object.values(ioData.links).includes(pin)) {
		if(ioData.controllable_pins[pin] != '0') {
			for(var i in ioData.links) {
				if(ioData.links[i] == pin) {
					delete ioData.links[i];
					io.emit('pinHasBeenUnlinked', {'input': i});
					callback(true);
				}
			}
		} else {
			delete ioData.links[pin];
			io.emit('pinHasBeenUnlinked', {'input': pin});
			callback(true);
		}
	} else {
		callback(false);
	}
};

const setMonostable = (pin, timeout, callback) => {
	if(!isNaN(timeout) && timeout > 0 && (ioData.controllable_pins[pin] == '1' || ioData.controllable_pins[pin] == '2')) {
		ioData.timeouts[pin] = timeout;
		ioData.controllable_pins[pin] = '2';
		callback(true);
		return true;
	}
	callback(false);
	return false;
};

const setBistable = (pin, callback) => {
	if(ioData.controllable_pins[pin] == '1' || ioData.controllable_pins[pin] == '2') {
		ioData.timeouts[pin] = 0;
		ioData.controllable_pins[pin] = '1';
		callback(true);
		return true;
	}
	callback(false);
	return false;
};

const windowsblueStatusUpdater = () => {
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
};

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

	socket.on('stateChangeRequest', ({ pin, state }) => {
		if(Object.values(ioData.links).includes(pin)) {
			console.log('Linked output pins cannot be controlled manually.');
			io.emit('stateHasChanged', {'pin': pin, 'state': ioData.pinStates[pin]});
		} else {
			changeState(pin, state, success => {
				if(success != true) { 
					console.log("Error at stateChangeRequest!");
					return;
				}
			});
		}
	});

	socket.on('bistableRequest', ({ pin }) => {
		setBistable(pin, success => {
			if(success != true) {
				console.log('An error occured while setting bistable pin ' + pin + '.');
				return;
			}
		});
	});

	socket.on('linkToInput', ({ input, output }) => {
		linkPins(input, output, success => {
			if(success != true) {
				console.log('Error while linking input ' + input + ' to output ' + output + '.');
				return;
			}
		});
	});

	socket.on('unlinkPin', ({ pin }) => {
		unlinkPin(pin, success => {
			if(success != true) {
				console.log('Error while unlinking pin ' + pin + '.');
				return;
			}
		});
	});

	socket.on('monostableRequest', ({ pin, timeout }) => {
		setMonostable(pin, timeout, success => {
			if(success != true) {
				console.log('An error occured while setting monostable pin ' + pin + ' with timeout of ' + timeout + '.');
				return;
			}
		});
	});

	socket.on('addNewTask', (taskData) => {
		newTask(taskData);
	});

	socket.on('getRunningTasks', () => {
		io.emit('activeTasks', ioData.runningTasks);
	});

	socket.on('removeTaskRequest', ({ uniqueId }) => {
		removeTask(uniqueId);
	});

	socket.on('newPinRequest', ({ pin, direction }) => {
		addPin(pin, direction, 0, success => {
			if(success != true) {
				console.log('An error occured while adding pin ' + pin + ' with direction number ' + direction);
				return;
			}
		});
	});

	socket.on('removePinRequest', ({ pin }) => {
		removePin(pin, success => {
			if(success != true) {
				console.log('An error occured while removing pin ' + pin + '.');
				return;
			}
		});
	});

	socket.on('renamePinRequest', ({ pin, name }) => {
		renamePin(pin, name, success => {
			if(success != true) {
				console.log('An error occured while renaming pin ' + pin + '.');
				return;
			}
		});
	});

	socket.on('renameBoardRequest', ({ name }) => {
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

const listen = server.listen(serverPort || '80');

process.once('SIGUSR2', function () {
	listen.close(function () {
		process.kill(process.pid, 'SIGUSR2');
	});
});
