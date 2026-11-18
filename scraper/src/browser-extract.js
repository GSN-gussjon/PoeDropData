/*
 * Kod wykonywany wewnątrz strony przez page.evaluate().
 * Zwykły JS (nie TS) — tsx/esbuild dodawałyby helper __name,
 * który nie istnieje w kontekście przeglądarki.
 * Zwraca strukturę zgodną z typem ExtractedTable z parse.ts.
 */
;(() => {
  const SECTION_WORDS = [
    'unique',
    'encounter-specific',
    'additional drops',
    'other drops',
    'loot',
    'drops'
  ]
  const CHANCE_PATTERN = /^[~<>]?\s*\d+(?:\.\d+)?\s*%(\s*total)?$/i
  const JUNK_PATTERN =
    /^(always|several|note|one of the|the following|drops? on|chance to|ritual base type|base type|corpse item|corpse)\b/i
  const INFLUENCE_JUNK = /\b(crusader|hunter|redeemer|warlord|shaper|elder)[- ]items?$/i

  function textOf(element) {
    const clone = element.cloneNode(true)
    for (const br of Array.from(clone.querySelectorAll('br'))) {
      br.replaceWith(document.createTextNode(' '))
    }
    return (clone.textContent || '').replace(/\s+/g, ' ').replace(/-\s+/g, '-').trim()
  }

  function fullImageUrl(url) {
    try {
      const parsed = new URL(url, location.href)
      if (parsed.hostname.endsWith('poewiki.net') && parsed.pathname.includes('/images/thumb/')) {
        parsed.pathname = parsed.pathname
          .replace(/^\/images\/thumb\//, '/images/')
          .replace(/\/[^/]+$/, '')
        parsed.search = ''
        return parsed.href
      }
    } catch (_) {
      // pozostawiamy oryginalny URL
    }
    return url
  }

  function ownTextOf(li) {
    const clone = li.cloneNode(true)
    for (const nested of Array.from(clone.querySelectorAll('ul, ol'))) nested.remove()
    return textOf(clone)
  }

  function parseItem(li) {
    const raw = textOf(li)
    const ownText = ownTextOf(li)
    const match = ownText.match(/^(.*?)\s*\(([^()]*)\)\s*$/)
    const link = li.querySelector('a')
    let name = (link?.textContent || (match ? match[1] : ownText)).replace(/\s+/g, ' ').trim()
    let chance = null
    let note = null
    if (match) {
      const candidate = match[2].trim()
      if (CHANCE_PATTERN.test(candidate)) chance = candidate
      else note = candidate
    }

    const img = li.querySelector('img')
    let iconUrl = null
    if (img) {
      try {
        iconUrl = fullImageUrl(new URL(img.getAttribute('src') || '', location.href).href)
      } catch (_) {
        iconUrl = null
      }
    }

    // Czasem wiki daje w komórce ogólne słowo (np. „mods") z ikoną właściwego
    // przedmiotu — odtwórz nazwę z nazwy pliku ikony.
    if (/^(mods?|modifiers?|various|others?)$/i.test(name) && iconUrl) {
      const fromIcon = decodeURIComponent(iconUrl.split('?')[0]).match(/\/([^/]+)_inventory_icon\.png$/)
      if (fromIcon) name = fromIcon[1].replace(/^\d+px-/, '').replace(/_/g, ' ').trim()
    }

    const nested = li.querySelector(':scope > ul, :scope > ol')
    const children = nested
      ? Array.from(nested.querySelectorAll(':scope > li')).map((child) => parseItem(child))
      : []

    let href = null
    if (link) {
      try {
        href = new URL(link.getAttribute('href') || '', location.href).href
      } catch (_) {
        href = null
      }
    }

    // Opisy w tabeli („Always drops one of the two:", „Shaper-influenced")
    // nie są przedmiotami — nie mają odnośnika, ikony ani szansy.
    const junk =
      name.endsWith(':') ||
      JUNK_PATTERN.test(name) ||
      /-influenced$/i.test(name) ||
      INFLUENCE_JUNK.test(name) ||
      (!link && !img && !chance)

    return { name, chance, note, href, iconUrl, raw, junk, children }
  }

  function cleanItems(item) {
    if (item.junk) return item.children.flatMap(cleanItems)
    return [{ ...item, children: item.children.flatMap(cleanItems) }]
  }

  function itemsFromCell(cell) {
    const lists = Array.from(cell.querySelectorAll(':scope > ul, :scope > ol, :scope > p > ul'))
    if (lists.length === 0) {
      const text = textOf(cell)
      if (!text || text === '—' || text === '-' || JUNK_PATTERN.test(text) || text.endsWith(':')) {
        return []
      }
      return [{ name: text, chance: null, note: null, href: null, iconUrl: null, junk: false, raw: text, children: [] }]
    }
    const items = []
    for (const list of lists) {
      for (const li of Array.from(list.querySelectorAll(':scope > li'))) {
        items.push(...cleanItems(parseItem(li)))
      }
    }
    return items
  }

  const content = document.querySelector('#mw-content-text, .mw-parser-output') || document.body
  const tables = Array.from(content.querySelectorAll('table'))
  let best = null

  for (const table of tables) {
    const rows = Array.from(table.querySelectorAll('tr'))
    if (rows.length < 2) continue

    const headerCells = Array.from(rows[0].querySelectorAll('th'))
    if (headerCells.length < 2) continue

    const variants = headerCells
      .slice(1)
      .map((cell) => textOf(cell))
      .filter(Boolean)
    if (variants.length < 1) continue

    const parsedSections = []
    for (const row of rows.slice(1)) {
      const cells = Array.from(row.querySelectorAll('th, td'))
      if (cells.length < 2) continue
      const title = textOf(cells[0])
      if (!title) continue

      const contentCells = cells.slice(1)
      const parsed = contentCells.map((cell) => itemsFromCell(cell))
      // Wiersz z jedną komórką treści obejmuje wszystkie warianty (colspan).
      const aligned =
        parsed.length === 1 && variants.length > 1
          ? Array.from({ length: variants.length }, () => parsed[0])
          : parsed

      parsedSections.push({ title, cells: aligned })
    }

    // Tabela dropów ma w pierwszej kolumnie nazwy kategorii („Guaranteed Unique",
    // „Additional drops"). Tabele umiejętności mają tam nazwy ataków — odrzucamy je.
    const titleHits = parsedSections.filter((section) =>
      SECTION_WORDS.some((word) => section.title.toLowerCase().replace(/\s+/g, '').includes(word.replace(/\s+/g, '')))
    ).length
    if (titleHits === 0) continue

    const text = (table.textContent || '').toLowerCase()
    const percentCount = (text.match(/%/g) || []).length
    const score = titleHits * 20 + percentCount * 0.5 + variants.length

    if (!best || score > best.score) {
      best = { variants, sections: parsedSections, score }
    }
  }

  if (!best && content) {
    // Bossowie Delve mają sekcję „Item drops" z tabelą przedmiotów
    // (bez szans) — nagłówek „Item", „Drop level".
    for (const heading of Array.from(content.querySelectorAll('h2, h3'))) {
      if (!/^item drops?$/i.test(textOf(heading))) continue
      let node = heading.nextElementSibling
      while (node && !/^H[1-3]$/.test(node.tagName)) {
        const table = node.tagName === 'TABLE' ? node : node.querySelector('table.item-table, table.wikitable')
        if (!table) {
          node = node.nextElementSibling
          continue
        }
        const items = []
        const seenNames = new Set()
        for (const row of Array.from(table.querySelectorAll('tr')).slice(1)) {
          const cell = row.querySelector('td')
          const link = cell && cell.querySelector('a')
          if (!link) continue
          const name = textOf(link)
          if (!name || JUNK_PATTERN.test(name) || name.endsWith(':') || seenNames.has(name)) continue
          seenNames.add(name)
          let iconUrl = null
          const img = cell.querySelector('img')
          if (img) {
            try {
              iconUrl = fullImageUrl(new URL(img.getAttribute('src') || '', location.href).href)
            } catch (_) {
              iconUrl = null
            }
          }
          let href = null
          try {
            href = new URL(link.getAttribute('href') || '', location.href).href
          } catch (_) {
            href = null
          }
          items.push({ name, chance: null, note: null, href, iconUrl, junk: false, raw: name, children: [] })
        }
        if (items.length > 0) {
          best = {
            variants: [document.title.replace(/\s*\|\s*PoE Wiki$/, '').trim() || 'Boss'],
            sections: [{ title: textOf(heading), cells: [items] }],
            score: 10 + items.length
          }
        }
        break
      }
      if (best) break
    }
  }

  if ((!best || best.score < 5) && content) {
    // Część stron (np. Atziri) ma drop-y jako listy pod nagłówkiem „Drops",
    // a wariant Uber jako podsekcję „Uber Atziri".
    const pageName = (document.title.split(' | ')[0] || '').split(',')[0].trim() || 'Boss'
    const listVariants = []
    const listCells = []

    for (const heading of Array.from(content.querySelectorAll('h2, h3'))) {
      const headingText = textOf(heading)
      const isDrops = /^drops?$/i.test(headingText)
      const isUberSub = heading.tagName === 'H3' && /^uber atziri$/i.test(headingText)
      if (!isDrops && !isUberSub) continue

      const items = []
      let node = heading.nextElementSibling
      while (node && !/^H[1-3]$/.test(node.tagName)) {
        const lists = /^(UL|OL)$/.test(node.tagName) ? [node] : []
        for (const list of Array.from(node.querySelectorAll('ul, ol'))) lists.push(list)
        for (const list of lists) {
          const introText = `${list.previousElementSibling?.textContent || ''} ${
            list.parentElement?.previousElementSibling?.textContent || ''
          }`
          if (/corpse|base type/i.test(introText)) continue
          for (const li of Array.from(list.querySelectorAll(':scope > li'))) {
            items.push(...cleanItems(parseItem(li)))
          }
        }
        node = node.nextElementSibling
      }
      if (items.length > 0) {
        listVariants.push(isUberSub ? headingText : pageName)
        listCells.push(items)
      }
    }

    if (listVariants.length > 0) {
      best = {
        variants: listVariants,
        sections: [{ title: 'Drops', cells: listCells }],
        score: 10 + listCells.reduce((sum, cell) => sum + cell.length, 0)
      }
    }
  }

  if (!best || best.score < 5) return null
  return best
})()
