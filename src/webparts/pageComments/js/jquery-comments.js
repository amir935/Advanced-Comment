/* Fully Corrected jquery-comments.js 1.4.0 */

(function (factory) {
  if (typeof define === "function" && define.amd) {
    define(["jquery"], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = function (root, jQuery) {
      if (!jQuery) {
        jQuery = require("jquery")(root);
      }
      factory(jQuery);
      return jQuery;
    };
  } else {
    factory(jQuery);
  }
})(function ($) {

  const Comments = {
    $el: null,
    commentsById: {},
    dataFetched: false,
    currentSortKey: "",
    options: {},

    getDefaultOptions: function () {
      return {
        profilePictureURL: "",
        currentUserIsAdmin: false,
        currentUserId: null,

        spinnerIconURL: "",
        upvoteIconURL: "",
        replyIconURL: "",
        uploadIconURL: "",
        attachmentIconURL: "",
        fileIconURL: "",
        noCommentsIconURL: "",

        origin: window.location.origin,
        siteURL: "",
        textareaPlaceholderText: "Add a comment",
        newestText: "Newest",
        oldestText: "Oldest",
        popularText: "Popular",
        attachmentsText: "Attachments",
        sendText: "Send",
        replyText: "Reply",
        editText: "Edit",
        editedText: "Edited",
        youText: "You",
        saveText: "Save",
        deleteText: "Delete",
        newText: "New",
        viewAllRepliesText: "View all __replyCount__ replies",
        hideRepliesText: "Hide replies",
        noCommentsText: "No comments",
        noAttachmentsText: "No attachments",
        attachmentDropText: "Drop files here",
        attachmentFileFormats: "audio/*,image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx",
        attachmentFileSize: 10,

        enableReplying: true,
        enableEditing: true,
        enableUpvoting: true,
        enableDeleting: true,
        enableAttachments: false,
        enableHashtags: false,
        enablePinging: false,
        enableDeletingCommentWithReplies: true,
        enableNavigation: true,
        enableDocumentPreview: false,
        postCommentOnEnter: false,
        forceResponsive: false,
        readOnly: false,
        defaultNavigationSortKey: "newest",

        highlightColor: "#079246",
        deleteButtonColor: "#2a7386",

        scrollContainer: null,
        roundProfilePictures: false,
        textareaRows: 2,
        textareaRowsOnFocus: 2,
        textareaMaxRows: 5,
        maxRepliesVisible: 2,

        fieldMappings: {
          id: "id",
          parent: "parent",
          created: "created",
          modified: "modified",
          content: "content",
          file: "file",
          fileURL: "file_url",
          fileID: "file_id",
          fileMimeType: "file_mime_type",
          pings: "pings",
          creator: "creator",
          fullname: "fullname",
          profileURL: "profile_url",
          profilePictureURL: "profile_picture_url",
          isNew: "is_new",
          createdByAdmin: "created_by_admin",
          createdByCurrentUser: "created_by_current_user",
          upvoteCount: "upvote_count",
          userHasUpvoted: "user_has_upvoted",
        },

        textFormatter: function (text) { return text; },
        timeFormatter: function (time) { return new Date(time).toLocaleDateString(); },

        searchUsers: function (term, success, error) { success([]); },
        getComments: function (success, error) { success([]); },
        postComment: function (commentJSON, success, error) { success(commentJSON); },
        putComment: function (commentJSON, success, error) { success(commentJSON); },
        deleteComment: function (commentJSON, success, error) { success(); },
        upvoteComment: function (commentJSON, success, error) { success(commentJSON); },
        hashtagClicked: function (hashtag) {},
        pingClicked: function (userId) {},
        uploadAttachments: function (commentArray, success, error) { success(commentArray); },
        refresh: function () {},
      };
    },

    createCommentModel: function (commentJSON) {
      var commentModel = this.applyInternalMappings(commentJSON);
      commentModel.childs = [];
      if (typeof commentModel.userHasUpvoted === 'undefined') {
        commentModel.userHasUpvoted = false;
      }
      return commentModel;
    },

    createUpvoteElement: function (commentModel) {
      var likeIcon = $("<i/>", { class: "fa fa-thumbs-up like" });
      if (this.options.upvoteIconURL.length) {
        likeIcon.css("background-image", 'url("' + this.options.upvoteIconURL + '")').addClass("image");
      }

      var upvoteButton = $("<button/>", {
        class: "action upvote" + (commentModel.userHasUpvoted ? " highlight-font" : "")
      });

      upvoteButton.append($("<span/>", {
        text: commentModel.upvoteCount,
        class: "upvote-count"
      }));

      upvoteButton.append(likeIcon);

      return upvoteButton;
    },

    reRenderUpvotes: function (id) {
      var commentModel = this.commentsById[id];
      var commentElements = this.$el.find('li.comment[data-id="' + commentModel.id + '"]');

      commentElements.each((index, commentEl) => {
        var newUpvoteButton = this.createUpvoteElement(commentModel);
        $(commentEl).find(".upvote").first().replaceWith(newUpvoteButton);
      });
    },

    applyInternalMappings: function (external) {
      const internal = {};
      const map = this.options.fieldMappings;
      for (const internalField in map) {
        if (map.hasOwnProperty(internalField)) {
          internal[internalField] = external[map[internalField]];
        }
      }
      return internal;
    },
  };

  $.fn.comments = function (options) {
    return this.each(function () {
      const comments = Object.create(Comments);
      $.data(this, "comments", comments);
      comments.$el = $(this);
      comments.options = $.extend(true, {}, comments.getDefaultOptions(), options);
      comments.scrollContainer = comments.$el;
      comments.commentsById = {};
    });
  };

  $(document).on('click', '.jquery-comments .like', function () {
    $(this).toggleClass('active');
  });

  $(document).on('click', '.jquery-comments .upvote', function () {
    var commentId = $(this).closest('li.comment').data('id');
    var commentsInstance = $(this).closest('.jquery-comments').data('comments');

    if (commentsInstance) {
      var commentModel = commentsInstance.commentsById[commentId];
      commentModel.userHasUpvoted = !commentModel.userHasUpvoted;
      commentModel.upvoteCount += (commentModel.userHasUpvoted ? 1 : -1);
      commentsInstance.reRenderUpvotes(commentId);
    }
  });

});