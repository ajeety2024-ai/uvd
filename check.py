import re
html=open('static/index.html', encoding='utf-8').read()
js=open('static/js/app.js', encoding='utf-8').read()
ids=re.findall(r'document\.getElementById\([\'\"](.*?)[\'\"]\)', js)
missing=[i for i in ids if f'id="{i}"' not in html]
print('Missing:', missing)

