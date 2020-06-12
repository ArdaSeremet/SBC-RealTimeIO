var socketInstances = {};
var activeSessions = [];
var boardDatas = {};

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
				<a class="reboot-btn" id="reboot-btn" onclick="reboot('${socket.id}', '${(ipAddress != '') ? 'http://' + ipAddress : ''}')">Reboot The System</a>
				
				<form data-socket-id="${socket.id}" action="${(ipAddress != '') ? 'http://' + ipAddress : ''}/static-ip/set" method="GET">
				<div class="form-control">
				<label for="ip-address">IP Address</label>
				<input data-socket-id="${socket.id}" type="text" id="ip-address" name="ip-address">
				</div>

				<div class="form-control">
				<label for="gateway-ip-address">Gateway IP</label>
				<input data-socket-id="${socket.id}" type="text" id="gateway-ip-address" name="gateway-ip-address">
				</div>

				<div class="form-control">
				<select name="dhcp" data-socket-id="${socket.id}">
					<option value="true">DHCP</option>
					<option value="false">Static IP</option>
				</select>
				</div>
				<div class="form-control">
				<button value="0" type="submit">Save</button>
				</div>

				</form>
			</div>
		</div>
				`;
			$('main#page-content').append(html);
			$.ajax({
				url: (ipAddress != '' ? 'http://' + ipAddress : '') +'/static-ip/get',
				type: 'GET',
				success: (data) => {
					$("input#ip-address[data-socket-id='"+socket.id+"']").attr('value', data['ip-address']);
			        	$("input#gateway-ip-address[data-socket-id='"+socket.id+"']").attr('value', data['gateway-ip-address']);
					if(data['dhcp'] == 'true') {
						$("select[data-socket-id='"+ socket.id +"']").children("option[value='true']").attr('selected', 'selected');
					}else{
						$("select[data-socket-id='"+ socket.id +"']").children("option[value='false']").attr('selected', 'selected');
					}
				}
			});
			$('form[data-socket-id="'+ socket.id +'"]').on('submit', (e) => {
				e.preventDefault();
				$("html, body").animate({ scrollTop: 0 }, "slow");
				var formElement = $('form[data-socket-id="'+ socket.id +'"]');
				var formAction = formElement.attr('action');
				var username = prompt('Please enter username to change IP address.');
				var password = prompt('Please enter password.');
				if(username == '' || password == '' || username == null || password == null) { return false; }
				$.ajax({
					type: "GET",
					url: formAction,
					username: username,
					password: password,
					data: formElement.serialize(),
					success: data => {
						if($(".formAlert[data-socket-id='"+ socket.id +"']").length) {
							$(".formAlert[data-socket-id='"+ socket.id +"']").remove();
						}
						$("form[data-socket-id='"+ socket.id +"']").before(`<div data-socket-id="${socket.id}" class="formAlert">${data.toString()}</div>`);
					}
				});
			});
		});

	});
}

function reboot(socketId, ipAddress) {
	let confirmation = confirm('Are you sure you want to reboot the system?');
	if(confirmation) {
		let username = prompt('Enter the username for authentication.');
		let password = prompt('Enter the password for authentication.');
		$.ajax({
			url: ipAddress + '/reboot',
			method: 'GET',
			username: username,
			password: password,
			success: data => {
				let messageArea = $(".messageArea[data-socket-id='"+socketId+"']");
				messageArea.html('Request has been sent to the board!');
			},
			error: err => {
				let messageArea = $(".messageArea[data-socket-id='"+socketId+"']");
				messageArea.html('An error occured.');
			}
		});
		//window.location.href = ipAddress + '/reboot'; 
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
	setInterval(checkBoardConnection, 4000);

});
