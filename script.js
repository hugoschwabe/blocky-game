// --- Three.js Setup ---
let scene, camera, renderer, controls;
let objects = []; // To store all placeable/removable blocks
let rollOverMesh, rollOverMaterial; // For the highlight cube
let raycaster;

// Player variables
const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;
const playerSpeed = 8.0; // Units per second
const playerHeight = 1.8; // Approximate player height
const worldSize = 20; // World dimensions (width/depth)
const worldHeight = 10; // World height
const gravity = 20;

// Block types
const blockTypes = {
	grass: 0x85cc60,
	dirt: 0x9b7653,
	stone: 0x808080,
	wood: 0xab855f,
	leaves: 0x4CAF50,
	sand: 0xf4a460,
};
const blockTypeNames = Object.keys(blockTypes); // Array of block type names
let selectedBlockType = 'grass'; // Default block type
let selectedBlockIndex = blockTypeNames.indexOf(selectedBlockType); // Index for cycling

// Pointers for mouse/touch interaction
const pointer = new THREE.Vector2();

window.onload = function() {
	init();
	animate();
};

function init() {
	// Scene
	scene = new THREE.Scene();
	scene.background = new THREE.Color(0x87CEEB); // Sky blue background
	scene.fog = new THREE.Fog(0x87CEEB, 0, 75);

	// Camera
	camera = new THREE.PerspectiveCamera(75, window.innerWidth / getGameContainerHeight(), 0.1, 1000);
	camera.position.y = playerHeight;
	camera.position.z = 5;

	// Renderer
	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setPixelRatio(window.devicePixelRatio);
	const gameContainer = document.getElementById('game-container');
	if (!gameContainer) {
		console.error("Error: game-container element not found!");
		return;
	}
	renderer.setSize(window.innerWidth, gameContainer.clientHeight);
	gameContainer.appendChild(renderer.domElement);


	// PointerLockControls for mouse look
	controls = new THREE.PointerLockControls(camera, renderer.domElement);
	const blocker = document.getElementById('blocker');
	const instructions = document.getElementById('instructions');
	const crosshair = document.getElementById('crosshair');

	instructions.addEventListener('click', function () {
		controls.lock();
	}, false);

	controls.addEventListener('lock', function () {
		instructions.style.display = 'none';
		blocker.style.display = 'none';
		crosshair.style.display = 'block';
	});

	controls.addEventListener('unlock', function () {
		blocker.style.display = 'flex';
		instructions.style.display = '';
		crosshair.style.display = 'none';
	});

	scene.add(controls.getObject());

	// Raycaster
	// Origin is handled by setFromCamera
	raycaster = new THREE.Raycaster();

	// --- Lighting ---
	const ambientLight = new THREE.AmbientLight(0xcccccc, 0.8);
	scene.add(ambientLight);
	const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
	directionalLight.position.set(1, 1, 0.5).normalize();
	scene.add(directionalLight);

	// --- Initial World (Ground & Random Blocks) ---
	// Create ground layer using grass blocks
	for (let x = -worldSize / 2; x < worldSize / 2; x++) {
		for (let z = -worldSize / 2; z < worldSize / 2; z++) {
			const grassBlock = createBlock(x + 0.5, -0.5, z + 0.5, 'grass'); // Blocks are 1 unit, centered at X.5, Y.5, Z.5
			scene.add(grassBlock);
			objects.push(grassBlock);

			// Add some random dirt below the grass (optional, but common)
			 const dirtBlock = createBlock(x + 0.5, -1.5, z + 0.5, 'dirt');
			 scene.add(dirtBlock);
			 objects.push(dirtBlock);

			 // Add random stone/wood features on top of grass
			if (Math.random() < 0.05 && (x !== 0 || z !== 0)) {
				const height = Math.floor(Math.random() * 3) + 1;
				for (let y = 0; y < height; y++) {
					const blockType = Math.random() < 0.7 ? 'stone' : 'wood';
					 // Place on top of the grass block
					const block = createBlock(x + 0.5, y + 0.5, z + 0.5, blockType);
					scene.add(block);
					objects.push(block);
				}
			}
		}
	}

	// --- Roll-over helpers ---
	const rollOverGeo = new THREE.BoxGeometry(1, 1, 1);
	rollOverMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, opacity: 0.5, transparent: true });
	rollOverMesh = new THREE.Mesh(rollOverGeo, rollOverMaterial);
	scene.add(rollOverMesh);

	// --- Event Listeners ---
	document.addEventListener('keydown', function (event) {
		switch (event.code) {
			case 'KeyW': moveForward = true; break;
			case 'KeyS': moveBackward = true; break;
			case 'KeyA': moveLeft = true; break;
			case 'KeyD': moveRight = true; break;
			case 'Space': canJump = true; break;
		}
	});

	document.addEventListener('keyup', function (event) {
		switch (event.code) {
			case 'KeyW': moveForward = false; break;
			case 'KeyS': moveBackward = false; break;
			case 'KeyA': moveLeft = false; break;
			case 'KeyD': moveRight = false; break;
			case 'Space': canJump = false; break;
		}
	});
	window.addEventListener('resize', onWindowResize);
	renderer.domElement.addEventListener('mousedown', onMouseDown, false);
	// Add mouse wheel listener for block selection
	renderer.domElement.addEventListener('wheel', onMouseWheel, false);

	// --- Block Selection UI ---
	setupBlockSelectionUI();
	// Ensure the initially selected block is highlighted
	updateBlockSelectionUI();
}

function getGameContainerHeight() {
	const container = document.getElementById('game-container');
	return container ? container.clientHeight : 0;
}

 function createBlock(x, y, z, type) {
	const blockGeo = new THREE.BoxGeometry(1, 1, 1);
	const color = blockTypes[type] !== undefined ? blockTypes[type] : 0xffffff;
	const blockMat = new THREE.MeshLambertMaterial({ color: color });
	const block = new THREE.Mesh(blockGeo, blockMat);
	block.position.set(x, y, z);
	block.userData.type = type;
	return block;
}

function onWindowResize() {
	const gameContainerHeight = getGameContainerHeight();
	if (gameContainerHeight > 0) {
		camera.aspect = window.innerWidth / gameContainerHeight;
		camera.updateProjectionMatrix();
		renderer.setSize(window.innerWidth, gameContainerHeight);
	}
}

function onMouseDown(event) {
	if (!controls.isLocked && crosshair.style.display === 'none') {
		if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
			 if (blocker.style.display !== 'none') return;
		} else {
			return;
		}
	}

	pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / getGameContainerHeight()) * 2 + 1);
	raycaster.setFromCamera((controls.isLocked || crosshair.style.display !== 'none') ? {x:0, y:0} : pointer, camera);
	const intersects = raycaster.intersectObjects(objects, false);

	if (intersects.length > 0) {
		const intersect = intersects[0];
		if (event.button === 0) { // Left click
			if (intersect.object.name !== "groundPlane" && intersect.object.geometry.type === "BoxGeometry") {
				scene.remove(intersect.object);
				objects.splice(objects.indexOf(intersect.object), 1);
			}
		} else if (event.button === 2) { // Right click
			const voxel = createBlock(0,0,0, selectedBlockType);
			// Corrected placement logic to rely on rollover mesh's pre-calculated position
			if (rollOverMesh.visible) { // Place only if a valid spot is highlighted
				voxel.position.copy(rollOverMesh.position);

				const playerPos = controls.getObject().position;
				const distToPlayer = voxel.position.distanceTo(playerPos);
				const playerBoundingBox = new THREE.Box3().setFromCenterAndSize(playerPos, new THREE.Vector3(1, playerHeight + 0.1, 1));
				const blockBoundingBox = new THREE.Box3().setFromCenterAndSize(voxel.position, new THREE.Vector3(1,1,1));

				if (distToPlayer < 10 && !isOccupied(voxel.position) && !playerBoundingBox.intersectsBox(blockBoundingBox) ) {
					scene.add(voxel);
					objects.push(voxel);
				}
			}
		}
	}
}

function onMouseWheel(event) {
	event.preventDefault(); // Prevent default scrolling behavior

	const direction = Math.sign(event.deltaY); // -1 for scroll up, 1 for scroll down

	selectedBlockIndex += direction;

	// Wrap around the array
	if (selectedBlockIndex < 0) {
		selectedBlockIndex = blockTypeNames.length - 1;
	} else if (selectedBlockIndex >= blockTypeNames.length) {
		selectedBlockIndex = 0;
	}

	selectedBlockType = blockTypeNames[selectedBlockIndex];

	// Update UI to show selected block
	updateBlockSelectionUI();
}

function setupBlockSelectionUI() {
	 const blockSelectionDiv = document.getElementById('block-selection');
	 blockSelectionDiv.innerHTML = ''; // Clear existing buttons

	blockTypeNames.forEach(typeName => {
		const button = document.createElement('button');
		button.textContent = typeName.charAt(0).toUpperCase() + typeName.slice(1);
		button.classList.add('control-button');
		button.style.backgroundColor = '#' + blockTypes[typeName].toString(16).padStart(6, '0');

		button.addEventListener('click', () => {
			selectedBlockType = typeName;
			 selectedBlockIndex = blockTypeNames.indexOf(selectedBlockType); // Update index
			updateBlockSelectionUI(); // Update UI
		});
		blockSelectionDiv.appendChild(button);
	});
}

function updateBlockSelectionUI() {
	 document.querySelectorAll('#block-selection .control-button').forEach(btn => {
		if (btn.textContent.toLowerCase() === selectedBlockType) {
			btn.classList.add('selected');
		} else {
			btn.classList.remove('selected');
		}
	});
}

function isOccupied(position) {
	const tolerance = 0.1;
	for (let i = 0; i < objects.length; i++) {
		// Don't check against rollover mesh
		if (objects[i] === rollOverMesh) continue;
		 // Check if the object is a block before comparing positions
		if (objects[i].geometry.type === "BoxGeometry") {
			 const objPos = objects[i].position;
			 // Check if positions are approximately the same
			 if (Math.abs(objPos.x - position.x) < tolerance &&
				Math.abs(objPos.y - position.y) < tolerance &&
				Math.abs(objPos.z - position.z) < tolerance) {
				return true;
			}
		}
	}
	return false;
}

let lastTime = performance.now();
// For touch look
let isLooking = false;

function animate() {
	requestAnimationFrame(animate);

	const time = performance.now();
	// Calculate delta time in seconds
	const delta = (time - lastTime) / 1000;
	let isGrounded = false;

	// Check if the player controls are active
	const isPlayerInteracting = controls.isLocked || isLooking;

	// --- Update Roll-over Mesh Position ---
	// Only update the roll-over mesh if the player is interacting AND the crosshair is visible
	if ((isPlayerInteracting || (crosshair.style.display !== 'none' && !('ontouchstart' in window || navigator.maxTouchPoints > 0))) && crosshair.style.display !== 'none') {

		// Raycast from the center of the camera view
		raycaster.setFromCamera({ x: 0, y: 0 }, camera);

		// Filter out the rollOverMesh itself from intersection tests
		const intersectableObjects = objects.filter(obj => obj !== rollOverMesh);

		// Find intersections with objects in the scene
		const intersects = raycaster.intersectObjects(intersectableObjects, false);

		if (intersects.length > 0) {
			const intersect = intersects[0];
			const normal = intersect.face.normal.clone();
			
			// Default placement is adjacent to the intersected face
			rollOverMesh.position.copy(intersect.object.position).add(normal);
			rollOverMesh.position.floor().addScalar(0.5); // Snap to grid

			// More robust check: if placing on top of a block, ensure Y is correct
			if (normal.y > 0.5) { // If normal is mostly pointing up
				rollOverMesh.position.set(
					Math.floor(intersect.object.position.x) + 0.5,
					Math.floor(intersect.object.position.y + 1) + 0.5,
					Math.floor(intersect.object.position.z) + 0.5
				);
			} else if (normal.y < -0.5) { // Mostly pointing down
				 rollOverMesh.position.set(
					Math.floor(intersect.object.position.x) + 0.5,
					Math.floor(intersect.object.position.y - 1) + 0.5,
					Math.floor(intersect.object.position.z) + 0.5
				);
			}
			rollOverMesh.visible = true;
		} else {
			// Hide the rollOverMesh if the raycaster doesn't hit anything
			rollOverMesh.visible = false;
		}
	} else {
		// Hide the rollOverMesh if the player is not interacting
		rollOverMesh.visible = false;
	}
	const playerObject = controls.getObject();
	if (playerObject.position.y < playerHeight) {
		playerObject.position.y = playerHeight;
		playerVelocity.y = 0;
	}

	// Handle jumping and gravity
	if (canJump) {
		playerVelocity.y = Math.sqrt(2 * gravity * 1);
		canJump = false;
		isGrounded = false; // Not relevant for this version, though for correct version
	} else {
		playerVelocity.y -= gravity * delta;
	}
	if (controls.isLocked === true) {
		playerVelocity.x -= playerVelocity.x * 10.0 * delta;
		playerVelocity.z -= playerVelocity.z * 10.0 * delta;
		
		// Get camera orientation
		const direction = new THREE.Vector3();
		camera.getWorldDirection(direction);

		// Flatten the direction (remove vertical pitch)
		direction.y = 0;
		direction.normalize();

		// Get right vector for strafing (perpendicular to forward)
		const right = new THREE.Vector3();
		right.crossVectors(direction, camera.up).normalize();

		// Reset input direction
		playerDirection.set(0, 0, 0);

		// Apply movement based on keys
		if (moveForward) playerDirection.add(direction);
		if (moveBackward) playerDirection.sub(direction);
		if (moveRight) playerDirection.add(right);
		if (moveLeft) playerDirection.sub(right);

		playerDirection.normalize();

		// --- Get flat forward and right vectors from camera ---
		const cameraDirection = new THREE.Vector3();
		camera.getWorldDirection(cameraDirection);
		cameraDirection.y = 0;
		cameraDirection.normalize();

		const cameraRight = new THREE.Vector3();
		cameraRight.crossVectors(cameraDirection, camera.up).normalize();

		// --- Build movement direction ---
		playerDirection.set(0, 0, 0);
		if (moveForward) playerDirection.add(cameraDirection);
		if (moveBackward) playerDirection.sub(cameraDirection);
		if (moveRight) playerDirection.add(cameraRight);
		if (moveLeft) playerDirection.sub(cameraRight);
		playerDirection.normalize();

		// --- Apply friction and acceleration ---
		playerVelocity.x -= playerVelocity.x * 5.0 * delta;
		playerVelocity.z -= playerVelocity.z * 5.0 * delta;

		playerVelocity.x += playerDirection.x * playerSpeed * delta * 5;
		playerVelocity.z += playerDirection.z * playerSpeed * delta * 5;

		// --- Save old position before applying ---
		const oldPosition = playerObject.position.clone();

		// --- Apply X and Z movement manually ---
		playerObject.position.x += playerVelocity.x * delta;
		if (checkCollision()) {
			playerObject.position.x = oldPosition.x;
			playerVelocity.x = 0;
		}

		playerObject.position.z += playerVelocity.z * delta;
		if (checkCollision()) {
			playerObject.position.z = oldPosition.z;
			playerVelocity.z = 0;
		}

		// --- Apply Y velocity separately ---
		playerObject.position.y += playerVelocity.y * delta;
		if (checkCollision()) {
			playerObject.position.y = oldPosition.y;
			playerVelocity.y = 0;
		}


		// Ground detection: cast a small box below player to see if touching ground
		const groundCheckBox = new THREE.Box3().setFromCenterAndSize(
			playerObject.position.clone().add(new THREE.Vector3(0, -0.1, 0)),
			new THREE.Vector3(0.8, 0.2, 0.8)
		);

		for (let obj of objects) {
			if (obj === rollOverMesh || obj.geometry.type !== "BoxGeometry") continue;
			const blockBox = new THREE.Box3().setFromObject(obj);
			if (groundCheckBox.intersectsBox(blockBox)) {
				isGrounded = true;
				break;
			}
		}
	}
	
	// Basic World Boundary checks (Optional: can be removed if world is defined by blocks)
	const halfWorld = worldSize / 2 - 0.5;
	playerObject.position.x = Math.max(-halfWorld, Math.min(halfWorld, playerObject.position.x));
	playerObject.position.z = Math.max(-halfWorld, Math.min(halfWorld, playerObject.position.z));

	lastTime = time;
	renderer.render(scene, camera);
}

function checkCollision() {
	const playerPos = controls.getObject().position;
	const playerBox = new THREE.Box3().setFromCenterAndSize(playerPos, new THREE.Vector3(0.8, playerHeight - 0.1, 0.8));

	for (let i = 0; i < objects.length; i++) {
		if (objects[i] === rollOverMesh) continue;
		if (objects[i].geometry.type === "BoxGeometry") {
			const blockBox = new THREE.Box3().setFromObject(objects[i]);
			if (playerBox.intersectsBox(blockBox)) {
				// Check if it's a vertical (Y-axis) collision
				if (playerPos.y > blockBox.max.y - 0.1) {
					isGrounded = true;
				}
				return true;
			}
		}
	}

	isGrounded = false;
	return false;
}