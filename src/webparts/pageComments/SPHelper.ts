import { sp } from "@pnp/sp";
import "@pnp/sp/webs";
import "@pnp/sp/lists/web";
import "@pnp/sp/folders/web";
import "@pnp/sp/files/folder";
import "@pnp/sp/items/list";
import "@pnp/sp/fields/list";
import "@pnp/sp/views/list";
import "@pnp/sp/site-users/web";
import { IList } from "@pnp/sp/lists";
import * as _ from "lodash";

export default class SPHelper {
  private lst_pageComments: string = "";
  private lst_pageDocuments: string = "";
  private lst_docListName: string = "";
  private _list: IList = null;
  private _doclist: IList = null;

  private cqPostDocs: string = `<View>
    <Query>
        <Where>
            <And>
                <Eq><FieldRef Name='FSObjType' /><Value Type='Text'>1</Value></Eq>
                <Eq><FieldRef Name='FileRef' /><Value Type='Text'>{{FilePath}}</Value></Eq>
            </And>
        </Where>
        <ViewFields><FieldRef Name="ID" /></ViewFields>
    </Query>
</View>`;

  constructor(lstDocLib?: string) {
    this.lst_pageComments = "Page Comments123";
    this._list = sp.web.lists.getByTitle(this.lst_pageComments);
    if (lstDocLib) {
      this.lst_pageDocuments = lstDocLib;
    }
  }

  public getDocLibInfo = async () => {
    this._doclist = sp.web.lists.getById(this.lst_pageDocuments);
    let listInfo: any = await this._doclist.select("Title").get();
    this.lst_docListName = listInfo.Title;
  };

  public queryList = async (query, $list: IList) => {
    return await $list.getItemsByCAMLQuery(query);
  };

  public getCurrentUserInfo = async () => {
    const currentUserInfo = await sp.web.currentUser.get();
    return {
      ID: currentUserInfo.Id,
      Email: currentUserInfo.Email,
      LoginName: currentUserInfo.LoginName,
      DisplayName: currentUserInfo.Title,
      Picture: `/_layouts/15/userphoto.aspx?size=S&username=${currentUserInfo.UserPrincipalName}`,
      IsSiteAdmin: currentUserInfo.IsSiteAdmin,
    };
  };

  public getSiteUsers = async (currentUserId: number) => {
    let resusers = await sp.web.siteUsers
      .filter("IsHiddenInUI eq false and PrincipalType eq 1")
      .get();
    _.remove(resusers, (o) => o.Id == currentUserId || o.Email == "");
    return resusers.map((user) => ({
      id: user.Id,
      fullname: user.Title,
      email: user.Email,
      profile_picture_url:
        "/_layouts/15/userphoto.aspx?size=S&username=" + user.UserPrincipalName,
      IsSiteAdmin: true, //user.IsSiteAdmin,
    }));
  };

  public getPostAttachmentFilePath = async (pageUrl) => {
    let pageName = pageUrl.split("/").pop().split(".").slice(0, -1).join(".");
    let res = await sp.web.select("ServerRelativeUrl").get();
    let doclistName =
      this.lst_docListName.toLowerCase() === "documents"
        ? "Shared Documents"
        : this.lst_docListName;
    return `${res.ServerRelativeUrl}/${doclistName}/${pageName}`;
  };

  public checkForPageFolder = async (postAttachmentPath) => {
    let xml = this.cqPostDocs.replace("{{FilePath}}", postAttachmentPath);
    let res = await this.queryList({ ViewXml: xml }, this._doclist);
    return res.length > 0;
  };

  public getPostComments = async (
    pageurl,
    currentUserInfo,
    commentJson = null
  ) => {
    const res = await this._list.items
      .select(
        "Comments",
        "Likes",
        "FieldValuesAsText/Comments",
        "FieldValuesAsText/Likes"
      )
      .filter(`PageURL eq '${pageurl}'`)
      .expand("FieldValuesAsText")
      .get();

    if (res.length === 0) return [];

    const rawComments = res[0].FieldValuesAsText.Comments;
    const rawLikes = res[0].FieldValuesAsText.Likes;

    const jsonComments = rawComments ? JSON.parse(rawComments) : [];
    const jsonLikes = rawLikes ? JSON.parse(rawLikes) : [];

    if (commentJson) {
      let voteEntry = jsonLikes.find((l) => l.commentID === commentJson.id);

      if (voteEntry) {
        const hasVoted = voteEntry.userVote.some(
          (v) => v.userid === currentUserInfo.ID
        );

        if (commentJson.user_has_upvoted && !hasVoted) {
          voteEntry.userVote.push({
            userid: currentUserInfo.ID,
            name: currentUserInfo.DisplayName,
          });
        }

        if (!commentJson.user_has_upvoted && hasVoted) {
          voteEntry.userVote = voteEntry.userVote.filter(
            (v) => v.userid !== currentUserInfo.ID
          );
        }
      } else if (commentJson.user_has_upvoted) {
        jsonLikes.push({
          commentID: commentJson.id,
          userVote: [
            {
              userid: currentUserInfo.ID,
              name: currentUserInfo.DisplayName,
            },
          ],
        });
      }

      await this.updateVoteForComment(pageurl, jsonLikes);
    }

    jsonLikes.forEach((likeEntry) => {
      const comment = jsonComments.find((c) => c.id === likeEntry.commentID);
      if (comment) {
        comment.upvote_count = likeEntry.userVote.length;
        comment.user_has_upvoted = likeEntry.userVote.some(
          (v) => v.userid === currentUserInfo.ID
        );
      }
    });

    return jsonComments;
  };

  public getComment = async (pageurl) => {
    let res = await this._list.items
      .select("Comments", "FieldValuesAsText/Comments")
      .filter(`PageURL eq '${pageurl}'`)
      .expand("FieldValuesAsText")
      .get();
    return res.length > 0 ? res[0].FieldValuesAsText.Comments : null;
  };

  public addComment = async (pageUrl, comments) => {
    const pageName = pageUrl.split("/").pop();
    return await sp.web.lists.getByTitle(this.lst_pageComments).items.add({
      Title: pageName,
      PageURL: pageUrl,
      Comments: JSON.stringify(comments),
    });
  };

  public updateComment = async (pageurl, comments) => {
    const pageComment = await this._list.items
      .select("ID")
      .filter(`PageURL eq '${pageurl}'`)
      .get();

    if (pageComment.length === 0) return;

    if (comments.length === 0) {
      return await this._list.items.getById(pageComment[0].ID).delete();
    }

    return await this._list.items.getById(pageComment[0].ID).update({
      Comments: JSON.stringify(comments),
    });
  };

  public postComment = async (
    pageurl: string,
    commentJson: any,
    currentUserInfo: any
  ) => {
    commentJson.userid = currentUserInfo.ID;
    commentJson.fullname = currentUserInfo.DisplayName;
    commentJson.created_by_current_user = true;

    let comments = await this.getPostComments(pageurl, currentUserInfo);
    comments.push(commentJson);

    if (comments.length === 1) {
      return await this.addComment(pageurl, comments);
    } else {
      return await this.updateComment(pageurl, comments);
    }
  };

  public voteComment = async (pageurl, commentJson, currentUserInfo) => {
    const res = await this._list.items
      .select("Likes", "FieldValuesAsText/Likes")
      .filter(`PageURL eq '${pageurl}'`)
      .expand("FieldValuesAsText")
      .get();

    const jsonLikes = res[0]?.FieldValuesAsText?.Likes
      ? JSON.parse(res[0].FieldValuesAsText.Likes)
      : [];

    let voteEntry = jsonLikes.find((l) => l.commentID === commentJson.id);
    const hasVoted = voteEntry?.userVote?.some(
      (v) => v.userid === currentUserInfo.ID
    );

    if (commentJson.user_has_upvoted && !hasVoted) {
      if (voteEntry) {
        voteEntry.userVote.push({
          userid: currentUserInfo.ID,
          name: currentUserInfo.DisplayName,
        });
      } else {
        jsonLikes.push({
          commentID: commentJson.id,
          userVote: [
            { userid: currentUserInfo.ID, name: currentUserInfo.DisplayName },
          ],
        });
      }
    } else if (!commentJson.user_has_upvoted && hasVoted) {
      voteEntry.userVote = voteEntry.userVote.filter(
        (v) => v.userid !== currentUserInfo.ID
      );
    }

    if (jsonLikes.length > 0) {
      return await this.updateVoteForComment(pageurl, jsonLikes);
    }

    return await this.addVoteForComment(pageurl, commentJson, currentUserInfo);
  };

  public updateVoteForComment = async (pageurl, jsonLikes) => {
    const pageComment = await this._list.items
      .select("ID")
      .filter(`PageURL eq '${pageurl}'`)
      .get();
    if (pageComment.length > 0) {
      return await this._list.items
        .getById(pageComment[0].ID)
        .update({ Likes: JSON.stringify(jsonLikes) });
    }
  };

  public addVoteForComment = async (pageurl, commentJson, currentUserInfo) => {
    const pageComment = await this._list.items
      .select("ID")
      .filter(`PageURL eq '${pageurl}'`)
      .get();
    if (pageComment.length > 0) {
      const tempLikes = [
        {
          commentID: commentJson.id,
          userVote: [
            { userid: currentUserInfo.ID, name: currentUserInfo.DisplayName },
          ],
        },
      ];
      return await this._list.items
        .getById(pageComment[0].ID)
        .update({ Likes: JSON.stringify(tempLikes) });
    }
  };

  public editComments = async (pageurl, commentJson, currentUserInfo) => {
    const commentsRaw = await this.getComment(pageurl);
    if (!commentsRaw) return { error: "No comments found" };

    const jsonComments = JSON.parse(commentsRaw);
    const match = jsonComments.find((c) => c.id === commentJson.id);
    if (!match) return { error: "Comment not found" };

    if (match.userid !== currentUserInfo.ID) {
      return { error: "Unauthorized" };
    }

    Object.assign(match, {
      pings: commentJson.pings,
      content: commentJson.content,
      modified: commentJson.modified,
    });

    await this.updateComment(pageurl, jsonComments);
    return { success: true };
  };

  public deleteComment = async (pageurl, commentJson, currentUserInfo) => {
    const commentsRaw = await this.getComment(pageurl);
    if (!commentsRaw) return;

    let jsonComments = JSON.parse(commentsRaw);

    const isOwner = jsonComments.some(
      (c) => c.id === commentJson.id && c.userid === currentUserInfo.ID
    );
    const isAdmin = currentUserInfo.IsSiteAdmin === true;

    if (!isOwner && !isAdmin) return { error: "Unauthorized" };

    // Remove the comment and any replies
    _.remove(
      jsonComments,
      (o: any) => o.id === commentJson.id || o.parent === commentJson.id
    );

    // Clean up orphaned child comments
    const validIds = new Set(jsonComments.map((c) => c.id));
    jsonComments = jsonComments.filter(
      (c) => !c.parent || validIds.has(c.parent)
    );

    return await this.updateComment(pageurl, jsonComments);
  };

  public createFolder = async (folderPath) => {
    return await sp.web.folders.add(folderPath);
  };

  public uploadFileToFolder = async (folderpath, fileinfo) => {
    return await sp.web
      .getFolderByServerRelativeUrl(folderpath)
      .files.add(fileinfo.name, fileinfo.content, true);
  };

  public postAttachments = async (
    commentArray: any[],
    pageFolderExists,
    postAttachmentPath
  ): Promise<any> => {
    if (!pageFolderExists) await this.createFolder(postAttachmentPath);
    const file = commentArray[0].file;
    const reader = new FileReader();

    return new Promise((resolve, reject) => {
      reader.onload = async () => {
        const contentBuffer = reader.result;
        const uploadedFile = await this.uploadFileToFolder(postAttachmentPath, {
          name: file.name,
          content: contentBuffer,
        });

        _.set(commentArray[0], "file_id", uploadedFile.data.UniqueId);
        _.set(
          commentArray[0],
          "file_url",
          `${postAttachmentPath}/${file.name}`
        );

        // 🛠 ensure userid is set correctly here too
        commentArray[0].userid =
          commentArray[0].userid || commentArray[0].currentUser?.ID || -1;

        resolve(commentArray);
      };

      reader.readAsArrayBuffer(file);
    });
  };

  public checkListExists = async (): Promise<boolean> => {
    try {
      await sp.web.lists.getByTitle(this.lst_pageComments).get();
      return true;
    } catch {
      const { list } = await sp.web.lists.ensure(this.lst_pageComments);
      await list.fields.addText("PageURL", 255, { Required: true });
      await list.fields.addMultilineText(
        "Comments",
        6,
        false,
        false,
        false,
        false,
        {
          Required: true,
        }
      );
      await list.fields.addMultilineText(
        "Likes",
        6,
        false,
        false,
        false,
        false,
        {
          Required: false,
        }
      );
      const allItemsView = await list.views.getByTitle("All Items");
      await allItemsView.fields.add("PageURL");
      await allItemsView.fields.add("Comments");
      await allItemsView.fields.add("Likes");
      return true;
    }
  };
}
