import pathlib
s = pathlib.Path(__file__).parent / 'src'
html = (s/'index.html').read_text()
html = html.replace('/*STYLE*/', (s/'style.css').read_text())
html = html.replace('/*JSZIP*/', (s/'vendor/jszip.min.js').read_text().replace('</script', '<\\/script'))
html = html.replace('/*APP*/', (s/'app.js').read_text().replace('</script', '<\\/script'))
out = pathlib.Path(__file__).parent / 'dist'; out.mkdir(exist_ok=True)
(out/'index.html').write_text(html)
print('ok', len(html))
