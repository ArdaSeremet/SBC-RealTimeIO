var socketInstances = {};
var activeSessions = [];
var boardDatas = {};
var taskTypeList = {
	"turnOn": "Turn Output On",
	"turnOff": "Turn Output Off",
	"unlink": "Unlink Output Pin",
	"linkToInput": "Link Output Pin to an Input",
	"setMonostable": "Set Output as Monostable(Timer Mode)",
	"setBistable": "Set Output as Bistable(On/Off Mode)"
};
var runningTasks = {};

function handleNewBoard(ipAddress) {
	if(ipAddress === undefined) {
		ipAddress = prompt('Please enter the board\'s IP address.');
	}
	let socket = io.connect(ipAddress, { reconnection: false });
	socket.on('connect', () => {
		socketInstances[socket.id] = socket;
		activeSessions.push(socket.id);
		socket.emit('ioRequest', '');

		socket.on('gpioData', (data) => {
			boardDatas[socket.id] = data;
			let html = `
			<div class="module" role="main" data-socket-id="${socket.id}">
			<div class="module-head">
				<h1><span>${data.boardName}</span></h1>
			</div>
			<div class="module-buttons">
				<a href="javascript:;" title="Rename The Board" class="board-action rename-board-btn" onclick="renameBoard('${socket.id}')"><i class="far fa-edit"></i></a>
				<a href="javascript:;" title="Remove The Board" id="removeBoard" class="module-remove-btn" onclick="removeBoard('${socket.id}')"><i class="fas fa-minus-circle"></i></a>
			</div>
			<div class="module-body">
				<div class="module io-module">
					<div class="module-head">
						<h3>Tasks</h3>
					</div>
					<div class="table-wrapper module-body" data-socket-id="${socket.id}">
						<table class="tasks">
							<thead>
								<th>Task Name</th>
								<th>Task Type</th>
								<th>Output Pin Name</th>
								<th>Task Value</th>
								<th>Date & Time</th>
								<th>Actions</th>
							</thead>
							<tbody data-socket-id="${socket.id}" role="taskTbody">
							</tbody>
						</table>
					</div>
				</div>
				<div class="module io-module">
					<div class="module-head">
						<h3>Create a New Task</h3>
					</div>
					<div class="module-body">
						<form class="tasksForm" data-socket-id=${socket.id}>
							<div class="form-control">
								<span>Task Name</span>
								<input type="text" name="taskName" required="required" />
							</div>
							<div class="form-control">
								<span>Task Type</span>
								<select required="required" name="taskType" data-socket-id="${socket.id}" role="taskType">
									${Object.keys(taskTypeList).map(item => {
										return '<option value="'+item+'">'+taskTypeList[item]+'</option>';
									}).join("")}
								</select>
							</div>
							<div class="form-control">
								<span>Output Pin Number</span>
								<select required="required" name="outputPinNumber">
									${data.pinOrder.map((item) => {
										if(data.controllable_pins[item] != '0') {
											return `<option value="${item}">${data.pinNames[item]}</option>`;
										}
									}).join("")}
								</select>
							</div>
							<div class="form-control">
								<span>Date & Time</span>
								<input required="required" type="datetime-local" name="datetime" />
							</div>
							<label class="form-control dir-row">
								<input type="hidden" name="repeatEveryday" value="off">
								<input type="checkbox" name="repeatEveryday" value="on">
								<span>Repeat this task everyday.</span>
							</label>
							<div class="form-control" data-socket-id="${socket.id}" role="taskValue">
								<input type="hidden" name="taskValue" value="0" />
							</div>
							<div class="form-control">
								<button type="submit" value="0">Create</button>
							</div>
						</form>
					</div>
				</div>
			</div>
		</div>
				`;
			$('main#page-content').append(html);
			drawTasksTable(socket.id, data.activeTasks);
			let createTaskForm = $("form[data-socket-id='"+ socket.id +"']");
			let taskTypeSelect = $("select[data-socket-id='"+ socket.id +"'][role='taskType']");
			taskTypeSelect.on('change', () => {
				console.log('TEST');
				let taskType = $("select[data-socket-id='"+ socket.id +"'][role='taskType']").children('option:selected').val();
				if(taskType == 'linkToInput') {
					let taskValDiv = $(".form-control[data-socket-id='"+ socket.id +"'][role='taskValue']");
					taskValDiv.html('<span>Input Pin Name</span>');
					taskValDiv.append(`
						<select required="required" name="taskValue">
							${ data.pinOrder.map(item => {
								if(data.controllable_pins[item] == '0') {
									return `<option value="${item}">${data.pinNames[item]}</option>`;
								}
							}).join("") }
						</select>
						`);
				} else if(taskType == 'setMonostable') {
					let taskValDiv = $(".form-control[data-socket-id='"+ socket.id +"'][role='taskValue']");
					taskValDiv.html('<span>Monostable Timeout</span>');
					taskValDiv.append(`<input required="required" type="number" name="taskValue">`);
				} else {
					let taskValDiv = $(".form-control[data-socket-id='"+ socket.id +"'][role='taskValue']");
					taskValDiv.html('<input type="hidden" name="taskValue" value="0" />');
				}
			});
			createTaskForm.on('submit', e => {
				e.preventDefault();
				$("html, body").animate({ scrollTop: 0 }, "slow");
				let socketInstance = socketInstances[socket.id];
				console.dir(objectifyForm($("form[data-socket-id='"+ socket.id +"']").serializeArray()));
				socketInstance.emit('addNewTask', objectifyForm($("form[data-socket-id='"+ socket.id +"']").serializeArray()));
				if($(".formAlert[data-socket-id='"+ socket.id +"']").length) {
					$(".formAlert[data-socket-id='"+ socket.id +"']").remove();
				}
				$("form[data-socket-id='"+ socket.id +"']").before(`<div data-socket-id="${socket.id}" class="formAlert">Request has been sent to the board!</div>`);
			});
		});
	});
}
function objectifyForm(formArray) {

  var returnArray = {};
  for (var i = 0; i < formArray.length; i++){
    returnArray[formArray[i]['name']] = formArray[i]['value'];
  }
  return returnArray;
}
const drawTasksTable = (socketId, tasks) => {
	let tasksTbody = $("tbody[data-socket-id='"+ socketId +"'][role='taskTbody']");
	for(let [uniqueId, cronData] of Object.entries(tasks)) {
		if(!(uniqueId in runningTasks)) {
			runningTasks[uniqueId] = cronData;
			let dateString = new Date(cronData.datetime);
			tasksTbody.append(`<tr data-unique-id="${uniqueId}" data-socket-id="${socketId}">
				<td>${cronData.taskName}</td>
				<td>${taskTypeList[cronData.taskType]}</td>
				<td>${boardDatas[socketId].pinNames[cronData.outputPinNumber]}</td>
				<td>${(cronData.taskType == 'linkToInput') ? boardDatas[socketId].pinNames[cronData.taskValue] : cronData.taskValue}</td>
				<td>${(cronData.repeatEveryday != 'on') ? dateString.toLocaleString('it-IT') : `${new Date(cronData.datetime + '+02:00').getHours()}:${new Date(cronData.datetime + '+02:00').getMinutes()}`}</td>
				<td><a href="javascript:removeTask('${socketId}', '${uniqueId}');">Remove</a></td>
				</tr>`);
		}
	}
}


function renameBoard(socketId) {
	let name = prompt('Please enter the new name of the board.');
	if(name && name != '' && name.length > 0) {
		let socketInstance = socketInstances[socketId];
		socketInstance.emit('renameBoardRequest', {'name': name});
	}else{
		alert('There is an error with your input.');
		return false;
	}

}


function handleAutomaticAddition() {
	let changeTo = '';
	if(localStorage.getItem('onbootboards') === null) {
		changeTo = prompt('Please enter addresses of the boards to load on pageload(Split multiple with comma(,))');
	}else{
		changeTo = prompt('Please enter addresses of the boards to load on pageload(Split multiple with comma(,))', localStorage.getItem('onbootboards'));
	}
	localStorage.setItem('onbootboards', changeTo == null ? '' : changeTo);
}

function getRenamedBoard() {
	for(let [socketId, socketInstance] of Object.entries(socketInstances)) {
		socketInstance.on('boardHasRenamed', (data) => {
			let name = data.name;
			let rename = $(`.module[data-socket-id=${socketId}] .module-head h1 span`).html(name);
			boardDatas[socketId].boardName = name;
			if(!rename) {
				console.log('Renaming error on board.');
			}
		});
	}
}

function getNewTask() {
	for(let [socketId, socketInstance] of Object.entries(socketInstances)) {
		socketInstance.on('newTaskCreated', (data) => {
			let { uniqueId, taskType, taskValue, datetime, outputPinNumber, taskName, repeatEveryday } = data;
			if(!(uniqueId in runningTasks)) {
				runningTasks[uniqueId] = data;
				let tasksTbody = $("tbody[data-socket-id='"+ socketId +"'][role='taskTbody']");
				let dateString = new Date(datetime);
				tasksTbody.append(`<tr data-unique-id="${uniqueId}" data-socket-id="${socketId}">
					<td>${taskName}</td>
					<td>${taskTypeList[taskType]}</td>
					<td>${boardDatas[socketId].pinNames[outputPinNumber]}</td>
					<td>${(taskType == 'linkToInput') ? boardDatas[socketId].pinNames[taskValue] : taskValue}</td>
					<td>${(repeatEveryday != 'on') ? dateString.toLocaleString('it-IT') : `${new Date(datetime + '+02:00').getHours()}:${new Date(datetime + '+02:00').getMinutes()}`}</td>
					<td><a href="javascript:removeTask('${socketId}', '${uniqueId}');">Remove</a></td>
				</tr>`);
			}
		});
	}
}

function getRemovedTask() {
	for(let [socketId, socketInstance] of Object.entries(socketInstances)) {
		socketInstance.on('taskHasBeenRemoved', (data) => {
			let uniqueId = data.uniqueId;
			let taskRow = $(`tr[data-socket-id='${socketId}'][data-unique-id='${uniqueId}']`);
			if(uniqueId in runningTasks) {
				delete runningTasks[uniqueId];
			}
			if(taskRow.length) {
				taskRow.remove();
			}
		});
	}
}

function removeTask(socketId, uniqueId) {
	let socketInstance = socketInstances[socketId];
	socketInstance.emit('removeTaskRequest', {'uniqueId': uniqueId});
}

function checkBoardConnection() {
	for(let [socketId, socketInstance] of Object.entries(socketInstances)) {
		if(!(socketInstance.connected)) {
			console.log('Dsc: ' + socketInstance.connected);
			$(`li[data-socket-id=${socketId}]`).attr('data-gpio-state', 'unknown');
			$(`li[data-socket-id=${socketId}] a`).removeAttr('onclick');
			$(`.module[data-socket-id=${socketId}] > .module-head h1 span`).append('<span class="inactiveBoard">(Board is inactive!)</span>');
			$(`.module[data-socket-id=${socketId}] .board-action`).removeAttr('onclick');
			delete socketInstances[socketId];
			delete activeSessions[socketId];
			delete boardDatas[socketId];
		}
	}
}

function addBoardsOnLoad() {
	let hostnames = localStorage.getItem('onbootboards');
	if(hostnames != '') {
		try {
			let hostArray = hostnames.split(',');
			hostArray.forEach(item => {
				handleNewBoard(item);
			});
		} catch(e) {
			console.log('No automatic addition boards found');
		}
	}
}

function removeBoard(socketId) {
	let confirmation = confirm('Are you sure you want to delete the board?');
	if(confirmation) {
		$(`.module[data-socket-id=${socketId}]`).remove();
		let socketInstance = socketInstances[socketId];
		socketInstance.close();
		delete socketInstances[socketId];
		delete boardDatas[socketId];
	}
}

$(() => {

	handleNewBoard('');
	addBoardsOnLoad();
	setInterval(getRenamedBoard, 3000);
	setInterval(getNewTask, 1000);
	setInterval(getRemovedTask, 1000);
	setInterval(checkBoardConnection, 4000);

});
