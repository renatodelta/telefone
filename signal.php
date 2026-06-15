<?php
// Simple Signaling Server for WebRTC VoIP calls
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$phone = $_GET['phone'] ?? $_POST['phone'] ?? ''; // 'a' or 'b'

$file = "state_" . ($phone === 'a' ? 'a' : 'b') . ".json";
if ($phone !== 'a' && $phone !== 'b') {
    echo json_encode(["status" => "error", "message" => "Invalid phone"]);
    exit;
}

// Ensure the file exists with initial state
if (!file_exists($file)) {
    saveState($file, [
        "status" => "idle",
        "peer" => "",
        "sdp" => null,
        "candidates" => []
    ]);
}

switch ($action) {
    case 'send':
        // Retrieve POST data
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input) {
            $input = $_POST;
        }

        $currentState = getState($file);

        if (isset($input['status'])) $currentState['status'] = $input['status'];
        if (isset($input['peer'])) $currentState['peer'] = $input['peer'];
        if (isset($input['sdp'])) $currentState['sdp'] = $input['sdp'];
        
        // Add new ICE candidates if sent
        if (isset($input['candidate'])) {
            $currentState['candidates'][] = $input['candidate'];
        }

        saveState($file, $currentState);
        echo json_encode(["status" => "success", "data" => $currentState]);
        break;

    case 'get':
        $currentState = getState($file);
        echo json_encode($currentState);
        break;

    case 'clear_candidates':
        $currentState = getState($file);
        $currentState['candidates'] = [];
        saveState($file, $currentState);
        echo json_encode(["status" => "success"]);
        break;

    case 'reset':
        $resetState = [
            "status" => "idle",
            "peer" => "",
            "sdp" => null,
            "candidates" => []
        ];
        saveState($file, $resetState);
        echo json_encode(["status" => "success", "data" => $resetState]);
        break;

    default:
        echo json_encode(["status" => "error", "message" => "Unknown action"]);
        break;
}

function getState($filepath) {
    $content = file_get_contents($filepath);
    return json_decode($content, true) ?: [];
}

function saveState($filepath, $data) {
    file_put_contents($filepath, json_encode($data, JSON_PRETTY_PRINT));
}
