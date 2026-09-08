from flask import Flask, request, jsonify
import requests
import json
import re
import time

url = "https://www.blackbox.ai/api/chat"
headers = {
	"Accept": "*/*",
	"Accept-Language": "en-US,en;q=0.5",
	"Referer": "https://www.blackbox.ai/",
	"Content-Type": "application/json",
	"Origin": "https://www.blackbox.ai",
	"Alt-Used": "www.blackbox.ai"
}

data = {
	"messages": [],
	"id": "",
	"previewToken": None,
	"userId": "",
	"codeModelMode": True,
	"agentMode": {},
	"trendingAgentMode": {},
	"isMicMode": False,
	"userSystemPrompt":"Explain this code",
	"maxTokens":1024,
	"webSearchMode":False,
	"promptUrls":"",
	"isChromeExt":False,
	"githubToken":None
}

response = {
	"id": "chat-free",
	"choices": [
		{
			"finish_reason": "stop",
			"index": 0,
			"logprobs": None,
			"message": {
				"content": "Orange who?",
				"role": "assistant",
				"function_call": None,
				"tool_calls": None
			}
		}
	],
	"created": 1704461729,
	"model": "real-human-brain",
	"object": "chat.completion",
	"system_fingerprint": None,
	"usage": {
		"completion_tokens": 0,
		"prompt_tokens": 0,
		"total_tokens": 0
	}
}

# Credit to Dan McDougall (liftoff) for trailing comma cleaner
def remove_trailing_commas(json_like):
	trailing_object_commas_re = re.compile(
		r'(,)\s*}(?=([^"\\]*(\\.|"([^"\\]*\\.)*[^"\\]*"))*[^"]*$)')
	trailing_array_commas_re = re.compile(
		r'(,)\s*\](?=([^"\\]*(\\.|"([^"\\]*\\.)*[^"\\]*"))*[^"]*$)')
	# Fix objects {} first
	objects_fixed = trailing_object_commas_re.sub("}", json_like)
	# Now fix arrays/lists [] and return the result
	return trailing_array_commas_re.sub("]", objects_fixed)

app = Flask(__name__)

@app.route('/api/chat/completions', methods=['POST'])
@app.route('/v1/chat/completions', methods=['POST'])
def process_prompt():
	# Set the timestamp for response
	response['created'] = int(round(time.time()))

	# Get the received data and clean it
	received_data = json.loads(remove_trailing_commas(request.get_data(as_text=True)))

	# Find the system prompt
	if received_data.get('messages') and len(received_data['messages']) > 0:
		data["userSystemPrompt"] = received_data['messages'][0].get('content', '')

	# Add any other messages to the prompt and format correctly
	for i, message in enumerate(received_data.get('messages', [])):
		if i >= 1:
			if message.get('role') == "assistant":
				data['messages'].append({"id":"","content": message.get('content', ''),"role": "assistant"})
			elif message.get('role') == "user":
				data['messages'].append({"id":"", "content": message.get('content', ''),"role": "user"})
			else:
				return jsonify({'error': 'Message Role missing or misspelled for messages after system prompt. Must be either "assistant" or "user"'})

	model = received_data.get('model', 'blackbox-chat')
	if model == "blackbox-code":
		data["codeModelMode"] = True
	else:
		data["codeModelMode"] = False

	# Set the model
	response['model'] = model
	# Set Max Tokens if given
	if "max_tokens" in received_data:
		data['maxTokens'] = received_data['max_tokens']
	print("Data before sending:", data)
	try:
		# Make the request to the blackbox.ai API
		blackbox_response = requests.post(url, headers=headers, json=data, timeout=15)
		response['choices'][0]['message']['content'] = blackbox_response.text
	except Exception as e:
		response['choices'][0]['message']['content'] = f"Blackbox AI bridge error: {str(e)}"

	return jsonify(response)

if __name__ == '__main__':
	# Runs on port 5001 to avoid conflicting with RetinoAI Express server on 5000
	app.run(host='0.0.0.0', port=5001)
