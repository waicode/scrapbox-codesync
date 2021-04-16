scrapbox.PopupMenu.addButton({
  title: "quote",
  onClick: (text) =>
    text
      .split(/\n/)
      .map((line) => ` > ${line}`)
      .join("\n"),
});
