import React, { useEffect, useState } from 'react';
import { Box, useColorModeValue } from '@chakra-ui/react';
import { ContentState, EditorState, convertToRaw, convertFromHTML } from 'draft-js';
import { Editor } from 'react-draft-wysiwyg';
import draftToHtml from 'draftjs-to-html';
import htmlToDraft from 'html-to-draftjs';
import sanitizeHtml from 'sanitize-html';
import 'react-draft-wysiwyg/dist/react-draft-wysiwyg.css';
import { getLangText } from 'lang/lang';

const TextEditor = (props) => {
  const { initialValue, onChange, disabled, isBlog = false } = props;
  const [editorState, setEditorState] = useState(EditorState.createEmpty());
  const borderColor = useColorModeValue("var(--chakra-colors-gray-200)", "var(--chakra-colors-whiteAlpha-300)");

  // Initialize editor with content from HTML
  useEffect(() => {
    if (!initialValue) return;

    const contentBlock = htmlToDraft(initialValue);
    if (contentBlock) {
      const contentState = ContentState.createFromBlockArray(contentBlock.contentBlocks);
      setEditorState(EditorState.createWithContent(contentState));
    }
  }, [initialValue]);

  const handleEditorState = (state) => {
    if (disabled) return;
    
    setEditorState(state);
    const contentState = state.getCurrentContent();
    const html = draftToHtml(convertToRaw(contentState));
    onChange && onChange(html);
  };

  const handleEditorStateChange = (state) => {
    handleEditorState(state);
  };

  const handlePastedText = (text, html, editorState) => {
    if (disabled) return false;

    // Handle plain text paste
    if (!html) {
      const newContentState = ContentState.createFromText(text);
      const newEditorState = EditorState.push(editorState, newContentState);
      setEditorState(newEditorState);
      return true;
    }

    // Sanitize and convert HTML to content state
    const cleanHtml = sanitizeHtml(html, {
      allowedTags: ['b', 'i', 'u', 'p', 'h1', 'h2', 'h3'],
      allowedAttributes: {}, // No inline styles or attributes
    });
    const blocksFromHTML = convertFromHTML(cleanHtml);
    const newContentState = ContentState.createFromBlockArray(
      blocksFromHTML.contentBlocks,
      blocksFromHTML.entityMap
    );
    const newEditorState = EditorState.push(editorState, newContentState);
    setEditorState(newEditorState);
    handleEditorState(newEditorState);
    return true;
  };

  const editorLabels = {
    // Generic
    'generic.add': getLangText("TEXT_EDITOR_GENERIC_ADD"),
    'generic.cancel': getLangText("TEXT_EDITOR_GENERIC_CANCEL"),

    // BlockType
    'components.controls.blocktype.h1': getLangText("TEXT_EDITOR_BLOCKTYPE_H1"),
    'components.controls.blocktype.h2': getLangText("TEXT_EDITOR_BLOCKTYPE_H2"),
    'components.controls.blocktype.h3': getLangText("TEXT_EDITOR_BLOCKTYPE_H3"),
    'components.controls.blocktype.h4': getLangText("TEXT_EDITOR_BLOCKTYPE_H4"),
    'components.controls.blocktype.h5': getLangText("TEXT_EDITOR_BLOCKTYPE_H5"),
    'components.controls.blocktype.h6': getLangText("TEXT_EDITOR_BLOCKTYPE_H6"),
    'components.controls.blocktype.blockquote': getLangText("TEXT_EDITOR_BLOCKTYPE_BLOCKQUOTE"),
    'components.controls.blocktype.code': getLangText("TEXT_EDITOR_BLOCKTYPE_CODE"),
    'components.controls.blocktype.blocktype': getLangText("TEXT_EDITOR_BLOCKTYPE_BLOCKTYPE"),
    'components.controls.blocktype.normal': getLangText("TEXT_EDITOR_BLOCKTYPE_NORMAL"),

    // Color Picker
    'components.controls.colorpicker.colorpicker': getLangText("TEXT_EDITOR_COLORPICKER_PICKER"),
    'components.controls.colorpicker.text': getLangText("TEXT_EDITOR_COLORPICKER_TEXT"),
    'components.controls.colorpicker.background': getLangText("TEXT_EDITOR_COLORPICKER_BACKGROUND"),

    // FontFamily
    'components.controls.fontfamily.fontfamily': getLangText("TEXT_EDITOR_FONTFAMILY_FAMILY"),
    
    // FontSize
    'components.controls.fontsize.fontsize': getLangText("TEXT_EDITOR_FONTSIZE_SIZE"),

    // History
    'components.controls.history.history': getLangText("TEXT_EDITOR_HISTORY_HISTORY"),
    'components.controls.history.undo': getLangText("TEXT_EDITOR_HISTORY_UNDO"),
    'components.controls.history.redo': getLangText("TEXT_EDITOR_HISTORY_REDO"),

    // Image
    'components.controls.image.image': 'Image',
    'components.controls.image.fileUpload': 'File Upload',
    'components.controls.image.byURL': 'URL',
    'components.controls.image.dropFileText': 'Drop the file or click to upload',

    // Inline
    'components.controls.inline.bold': getLangText("TEXT_EDITOR_INLINE_BOLD"),
    'components.controls.inline.italic': getLangText("TEXT_EDITOR_INLINE_ITALIC"),
    'components.controls.inline.underline': getLangText("TEXT_EDITOR_INLINE_UNDERLINE"),
    'components.controls.inline.strikethrough': getLangText("TEXT_EDITOR_INLINE_STRIKETHROUGH"),
    'components.controls.inline.monospace': 'Monospace',
    'components.controls.inline.superscript': getLangText("TEXT_EDITOR_INLINE_SUPERSCRIPT"),
    'components.controls.inline.subscript': getLangText("TEXT_EDITOR_INLINE_SUBSCRIPT"),

    // Link
    'components.controls.link.linkTitle': 'Link Title',
    'components.controls.link.linkTarget': 'Link Target',
    'components.controls.link.linkTargetOption': 'Open link in new window',
    'components.controls.link.link': 'Link',
    'components.controls.link.unlink': 'Unlink',

    // List
    'components.controls.list.list': 'List',
    'components.controls.list.unordered': getLangText("TEXT_EDITOR_LIST_UNORDERED"),
    'components.controls.list.ordered': getLangText("TEXT_EDITOR_LIST_ORDERED"),
    'components.controls.list.indent': getLangText("TEXT_EDITOR_LIST_INDENT"),
    'components.controls.list.outdent': getLangText("TEXT_EDITOR_LIST_OUTDENT"),

    // Remove
    'components.controls.remove.remove': getLangText("TEXT_EDITOR_REMOVE_REMOVE"),

    // TextAlign
    'components.controls.textalign.textalign': getLangText("TEXT_EDITOR_ALIGN_TEXTALIGN"),
    'components.controls.textalign.left': getLangText("TEXT_EDITOR_ALIGN_LEFT"),
    'components.controls.textalign.center': getLangText("TEXT_EDITOR_ALIGN_CENTER"),
    'components.controls.textalign.right': getLangText("TEXT_EDITOR_ALIGN_RIGHT"),
    'components.controls.textalign.justify': getLangText("TEXT_EDITOR_ALIGN_JUSTIFY"),
  };

  return (
    <Box border="1px solid" borderColor={borderColor} borderRadius="8px">
      <Editor
        editorState={editorState}
        onEditorStateChange={handleEditorStateChange}
        handlePastedText={handlePastedText}
        wrapperClassName="texteditor-wrapper"
        editorClassName={isBlog ? "texteditor-article" : "texteditor-editor"}
        toolbarClassName="texteditor-toolbar"
        localization={{
          locale: "en",
          translations: editorLabels,
        }}
        toolbar={{
          options: ['inline', 'blockType', 'textAlign', 'list', 'history'],
          inline: {
            inDropdown: false,
            options: ['bold', 'italic', 'strikethrough'],
          },
          blockType: {
            inDropdown: true,
            options: ['Normal', 'H1', 'H2', 'H3'],
          },
          fontSize: {
            options: [14, 16, 18, 24, 30],
          },
          textAlign: {
            options: ['left', 'center', 'right', "justify"],
          },
          list: {
            options: ['unordered', 'ordered'],
          },
          colorPicker: {
            colors: ['rgb(97,189,109)', 'rgb(26,188,156)', 'rgb(84,172,210)', 'rgb(44,130,201)',
              'rgb(147,101,184)', 'rgb(71,85,119)', 'rgb(204,204,204)', 'rgb(65,168,95)', 'rgb(0,168,133)',
              'rgb(61,142,185)', 'rgb(41,105,176)', 'rgb(85,57,130)', 'rgb(40,50,78)', 'rgb(0,0,0)',
              'rgb(247,218,100)', 'rgb(251,160,38)', 'rgb(235,107,86)', 'rgb(226,80,65)', 'rgb(163,143,132)',
              'rgb(239,239,239)', 'rgb(255,255,255)', 'rgb(250,197,28)', 'rgb(243,121,52)', 'rgb(209,72,65)',
              'rgb(184,49,47)', 'rgb(124,112,107)', 'rgb(209,213,216)'],
          },
          history: {
            options: ['undo', 'redo'],
          }
        }}
      />
    </Box>
  );
};

export default TextEditor;
