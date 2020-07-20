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
const httpAuthentication = {
	"username": "admin",
	"password": "password"
};
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
	const ioPlatform = 'wiring';
} else if(nodeName == "orangepizero") {
	const availablePins = ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','30'];
	const ioPlatform = 'wiring';
} else if(nodeName == "rockpis") {
	const ioPlatform = 'sysfs';
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
		res.write(json_encode({
			'status': 'error',
			'message': 'Invalid Authentication Credentials!'
		}));
	}

	try {
		res.send(json_encode({
			'status': 'success',
			'message': 'The request has been sent to the server!'
		}));
		execSync('systemctl reboot');
	} catch(e) {
		res.send(json_encode({
			'status': 'error',
			'message': 'An error occured while processing your request. Try again later.'
		}));
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

	res.writeHead(200, { 'Content-Type': 'text/json' });

	linkPins(input, output, success => {
		if(success != true) {
			const message = `Error while linking pin ${input} to output ${output} on GET request.`;
			console.log(message);
			res.end(json_encode({
				'status': 'error',
				'message': message
			}));
		}
		res.end(json_encode({
			'status': 'success',
			'message': `Successfully linked input pin ${input} to output pin ${output}.`
		}));
	});
});

app.get('/rename-board/:name', (req, res) => {
	let name = req.params.name.toString();

	res.writeHead(200, { 'Content-Type': 'text/json' });

	renameBoard(name, success => {
		if(success != true) {
			const message = 'Error while renaming board!';
			console.log(message);
			res.end(json_encode({
				'status': 'error',
				'message': message
			}));
		}
		res.end(json_encode({
			'status': 'success',
			'message': 'Successfully renamed the board!'
		}));
	});
});

app.get('/rename/:pin/:name', (req, res) => {
	let pin = req.params.pin.toString();
	let name = req.params.name.toString();

	res.writeHead(200, { 'Content-Type': 'text/json' });

	renamePin(pin, name, success => {
		if(success != true) {
			const message = 'Error while renaming pin!';
			console.log(message);
			res.end(json_encode({
				'status': 'error',
				'message': message
			}));
		}
		res.end(json_encode({
			'status': 'success',
			'message': 'Successfully renamed the pin!'
		}));
	});
});

app.get('/unlink/:pin', (req, res) => {
	let pin = req.params.pin.toString();

	res.writeHead(200, { 'Content-Type': 'text/json' });

	unlinkPin(pin, success => {
		if(success != true) {
			const message = `Error while unlinking pin ${pin}.`;
			console.log(message);
			res.end(json_encode({
				'status': 'error',
				'message': message
			}));
		}
		res.end(json_encode({
			'status': 'success',
			'message': 'Successfully unlinked pin!'
		}));
	});
});

app.get('/remove/:pin', (req, res) => {
	let pin = req.params.pin.toString();
	
	res.writeHead(200, { 'Content-Type': 'text/json' });

	removePin(pin, success => {
		if(success != true) {
			const message = `Error while removing pin number ${pin}!`;
			console.log(message);
			res.end(json_encode({
				'status': 'error',
				'message': message
			}));
		}
		res.end(json_encode({
			'status': 'success',
			'message': 'Successfully removed pin!'
		}));
	});
});

app.get('/set/:pin/:state', (req, res) => {
	let pin = req.params.pin.toString();
	let state = req.params.state.toString();

	res.writeHead(200, { 'Content-Type': 'text/json' });

	if(
		availablePins.includes(pin) &&
		!(Object.values(ioData.links).includes(pin)) &&
		ioData.controllable_pins[pin] != '0' &&
		(state == 'on' || state == 'off')
	) {
		let stateNum = state == 'on' ? '1' : '0';
		changeState(pin, stateNum, success => {
			if(success != true) {
				const message = `Error on changing state of pin ${pin}.`;
				console.error(message);
				res.end(json_encode({
					'status': 'error',
					'message': message
				}));
			}
			res.end(json_encode({
				'status': 'success',
				'message': 'Successfully set the state of pin!'
			}));
		});
	} else {
		res.end(json_encode({
			'status': 'error',
			'message': 'Wrong parameters sent!'
		}));
	}
});

app.get('/get/:pin', (req, res) => {
	let pin = req.params.pin.toString();

	res.writeHead(200, { 'Content-Type': 'text/json' });

	const directions = {
		'0': 'input',
		'1': 'bistable',
		'2': 'monostable'
	};

	if(pin == null || pin == '' || pin == undefined) {
		let pinDatas = [];
		for(const pin in ioData.controllable_pins) {
			const pinData = {
				'pinNumber': pin,
				'direction': directions[ioData.controllable_pins[pin]],
				'state': ioData.pinStates[pin]
			};

			pinDatas.push(pinData);
		}

		res.end(json_encode({
			'status': 'success',
			'message': pinDatas
		}));
	} else {
		if(
			!(availablePins.includes(pin)) ||
			!(pin in ioData.controllable_pins)
		) {
			res.end(json_encode({
				'status': 'error',
				'message': 'Invalid or unadded pin number!'
			}));
		}

		const pinData = {
			'pinNumber': pin,
			'direction': directions[ioData.controllable_pins[pin]],
			'state': ioData.pinStates[pin]
		};
		res.end(json_encode({
			'status': 'success',
			'message': pinData
		}));
	}
});

app.get('/add/:pin/:dir/:timeout?', (req, res) => {
	let pin = req.params.pin.toString();
	let dir = req.params.dir.toString();
	let timeout = '0';

	res.writeHead(200, { 'Content-Type': 'text/json' });

	if(req.params.timeout) {
		timeout = req.params.timeout.toString();
	}

	let availableOptions = {
		'output': '1',
		'monostable': '2',
		'bistable': '1',
		'input': '0'
	};

	if(!(dir in availableOptions) || !(availablePins.includes(pin))) {
		const message = `Invalid parameters sent!`;
		console.log(message);
		res.end(json_encode({
			'status': 'error',
			'message': message
		}));
	}

	let mode = availableOptions[dir];
	if(mode == '2' && (!timeout || isNaN(timeout) || timeout <= 0)) {
		const message = 'Monostable mode has requested but no timeout has sent!';
		console.log(message);
		res.end(json_encode({
			'status': 'error',
			'message': message
		}));
	}

	addPin(pin, mode, (mode == '2' ? timeout : 0), success => {
		if(success != true) {
			const message = 'Error while adding new pin!';
			console.log(message);
			res.end(json_encode({
				'status': 'error',
				'message': message
			}));
		}

		res.end(json_encode({
			'status': 'success',
			'message': `Pin number ${pin} has been added as ${dir}.`
		}));
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

		if(ioPlatform == 'wiring') {
			command = `gpio mode ${pin} ${modeStr} && gpio read ${pin}`;
		} else if(ioPlatform == 'sysfs') {
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

		if(ioPlatform == 'wiring') {
			command = `gpio write ${pin} ${stateStr}`;
		} else if(ioPlatform == 'sysfs') {
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

		if(ioPlatform == 'wiring') {
			command = `gpio read ${pin}`;
		} else if(ioPlatform == 'sysfs') {
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
		try {
			ioData = JSON.parse(data);
		} catch(e) {
			ioData = {};
		}
	} else {
		ioData = {};
	}

	ioData.initTime = new Date();
	if(!ioData.boardName || ioData.boardName == '' || ioData.boardName == null) {
		ioData.boardName = Math.random().toString(36).slice(2);
	}
	if(!(Object.keys(ioData).includes("controllable_pins"))) {
		ioData.controllable_pins = {};
	}
	if(!ioData.activeTasks) {
		ioData.activeTasks = {};
	}
	if(!ioData.links) {
		ioData.links = {};
	}
	if(!ioData.pinOrder) {
		ioData.pinOrder = [];
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

initData();

setInterval(checkInputPins, 300);
setInterval(checkOutputPins, 4000);
setInterval(saveData, 5000);

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
