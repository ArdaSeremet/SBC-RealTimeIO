#!/bin/bash

echo 'Updating package repos ==> '
sudo apt-get update
echo '----'

echo 'Installing Curl, AutoSSH and Git ==> '
sudo apt-get install curl git -y
echo '----'

echo 'Going to home directory ==> '
cd ~
echo '----'

echo 'Installing NodeJS Version 10'
curl -sL https://deb.nodesource.com/setup_12.x -o nodesource_setup.sh
sudo chmod +x ./nodesource_setup.sh
sudo bash nodesource_setup.sh
sudo rm nodesource_setup.sh
sudo apt-get install nodejs -y
echo '----'

echo 'Getting project files from GitHub'
cd ~
git clone https://github.com/ArdaSeremet/SBC-RealTimeIO.git
cd SBC-RealTimeIO
npm install
echo '----'

echo 'Setting systemd daemon for system bootup'
projectPath=$(pwd)
username=$(whoami)
sudo rm /etc/systemd/system/realtimeio.service
cat >> /etc/systemd/system/realtimeio.service <<EOF
[Unit]
Description=Realtime GPIO Controller for Linux SBCs

[Service]
User=${username}
Restart=always
KillSignal=SIGQUIT
WorkingDirectory=${projectPath}
ExecStart=${projectPath}/app.js

[Install]
WantedBy=multi-user.target
EOF
echo '----'

sudo systemctl daemon-reload
sudo systemctl enable gpioctrl
echo '----'

echo 'Running the server'
sudo systemctl start gpioctrl
echo '----'

echo 'Done installing the system! Have a nice day!'
