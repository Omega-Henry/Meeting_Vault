import re

STRICT_NOISE_REGEX = re.compile(r'^\W*(yes|no|nope|nah|yeah|yep|yup|ok|okay|thx|thanks|thank you|lol|lmao|haha|right|correct|sure|agreed|absolutely|less|more|same|me too|details\?)\W*$', re.IGNORECASE)

messages = [
    "Nope",
    "Nope ",
    "   Nope",
    "\tNope",
    "Yes",
    "Yes please",
    "Same",
    "Less"
]

print(f"Regex pattern: {STRICT_NOISE_REGEX.pattern}")

for msg in messages:
    clean = msg.strip()
    match = STRICT_NOISE_REGEX.search(clean)
    print(f"'{msg}' -> Clean: '{clean}' -> Match: {bool(match)}")
